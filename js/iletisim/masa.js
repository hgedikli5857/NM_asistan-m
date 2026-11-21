// İletişim Masası — Günlük Çalışma Yöntemi (WhatsApp CRM Operasyonu) uygulaması.
// Saf fonksiyonlar: öncelik sırası, rapor, etkinlik tutarlılığı, gün sonu özeti.
import { isExcluded } from './strateji.js';

const H = 3600e3;
const TZ = 'Europe/Istanbul';

// Kişi bir soru sordu mu / bilgi istedi mi?
export function isQuestion(text) {
  const t = String(text || '').toLocaleLowerCase('tr-TR');
  if (!t.trim()) return false;
  if (t.includes('?')) return true;
  return /(^|\s)(ne|neden|nasıl|nerede|nereye|nerde|kaç|kaçta|ne zaman|hangi|fiyat\w*|ücret\w*|saat\w*|adres\w*|konum\w*|bilgi\w*)(\s|$|[.,!])/u.test(t)
    || /\s(mi|mı|mu|mü|misiniz|mısınız|musunuz|müsünüz|miyim|mıyım)(\s|$|[.,!])/u.test(t);
}

// Kapanış / teşekkür mesajı: cevap beklemez
export function isClosing(text) {
  const t = String(text || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true; // yalnızca emoji / işaret
  if (String(text).includes('?') || t.length > 60) return false;
  return /^(çok )?(teşekkür\w*|tesekkur\w*|teşekür\w*|sağ ?ol\w*|sag ?ol\w*|eyvallah|rica ederim|iyi (günler|akşamlar|geceler|çalışmalar|hafta ?sonları)\w*( size de| sana da)?|size de|sana da|tamam\w*|ok|okey|olur|anlaştık|anlaşıldı|görüşürüz|kolay gelsin|amin|aynen|peki)( \p{L}+){0,3}$/u.test(t);
}

// Desteklenmeyen / yalnızca medya mesajı
export const isUnsupported = text => /desteklenmeyen mesaj|^\[(image|audio|video|sticker|document|other)\]$/i.test(String(text || '').trim());

// Hassas paylaşım (maddi zorluk, sağlık): acele edilmez, dinleme öncelikli
export function isSensitive(text) {
  return /(param yok|maddi|borç|borc|kredi kart|maaş|maas|işsiz|issiz|hastane|ameliyat|hasta\w*|doktor|rahatsız\w*|tedavi|ağrı\w*|agri\w*|vefat|cenaze)/iu.test(String(text || ''));
}

// 4) Kişi önceliklendirme — 7 kural
export function scoreItem({ conv, p, events = [], now = Date.now() }) {
  const reasons = [];
  let score = 0;
  const lastIn = conv?.last_in_at ? new Date(conv.last_in_at).getTime() : null;
  const windowOpen = !!(lastIn && now - lastIn < 24 * H);
  const ageH = lastIn ? (now - lastIn) / H : null;
  const awaiting = conv?.last_dir === 'gelen' && !isClosing(conv?.last_in_body) && !(ageH > 14 * 24);
  const unsupported = awaiting && isUnsupported(conv?.last_in_body);
  const question = awaiting && isQuestion(conv?.last_in_body);
  // 1) pencere açık
  if (windowOpen) { score += 30; reasons.push('Pencere açık'); }
  // 2) yanıt bekleniyor / soru sordu
  if (conv?.handoff_status === 'bekliyor') { score += 45; reasons.push('Bot sana devretti'); }
  if (question) { score += 50; reasons.push('Soru sordu'); }
  else if (awaiting && unsupported) { score += 10; reasons.push('Medya / desteklenmeyen mesaj'); }
  else if (awaiting) { score += 30; reasons.push('Cevap bekliyor'); }
  // eskidikçe aşağı (günde -2, en fazla -14; yine de takip gününün önünde kalır)
  if (awaiting && ageH > 24) score -= Math.min(14, Math.floor(ageH / 24) * 2);
  // 4) kayıt / teyit
  const ev = events.find(e => (e.katilimcilar || []).some(k => k.prospect_id === p?.id && k.durum === 'kayitli'));
  if (ev) {
    const until = new Date(ev.tarih_saat).getTime() - now;
    if (until > -3 * H && until < 72 * H) { score += 25; reasons.push('Etkinlik teyidi'); }
  }
  // 5) takip günü
  const due = p?.next_follow_up_at && new Date(p.next_follow_up_at).getTime() <= endOfDay(now);
  if (due) { score += 15; reasons.push('Takip günü'); }
  // 6) hassas durum
  const sensitive = awaiting && isSensitive(conv?.last_in_body);
  if (sensitive) { score -= 5; reasons.push('Hassas: önce dinle'); }
  // 7) soğuk / ilgisiz en sonda
  if (p?.stage === 'pasif') score -= 60;
  if (p?.temperature === 'soguk' && !awaiting) { score -= 20; reasons.push('Soğuk'); }
  // yeni mesaj sayısı küçük bir öne çekme
  if (conv?.in_24) score += Math.min(conv.in_24, 5);
  return { score, reasons, windowOpen, awaiting, question, sensitive, event: ev || null, due: !!due };
}

export function endOfDay(now = Date.now()) {
  const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime();
}

// Kuyruk: CRM konuşmaları + takip günü gelen adaylar. "!" ve pasif + sessizler dışarıda.
export function buildQueue({ convs = [], prospects = [], events = [], now = Date.now(), limit = 40 }) {
  const byId = new Map(prospects.map(p => [p.id, p]));
  const seen = new Set();
  const items = [];
  for (const c of convs) {
    const p = byId.get(c.prospect_id);
    if (!p || isExcluded(p) || seen.has(p.id)) continue;
    seen.add(p.id);
    const s = scoreItem({ conv: c, p, events, now });
    if (p.stage === 'pasif' && !s.awaiting) continue;
    // son mesaj bizdense ve başka sebep yoksa sıraya sokma
    if (!s.awaiting && !s.due && !s.event && c.handoff_status !== 'bekliyor') continue;
    items.push({ pid: p.id, p, conv: c, ...s });
  }
  for (const p of prospects) {
    if (seen.has(p.id) || isExcluded(p) || p.stage === 'pasif') continue;
    if (!p.next_follow_up_at || new Date(p.next_follow_up_at).getTime() > endOfDay(now)) continue;
    const s = scoreItem({ conv: null, p, events, now });
    items.push({ pid: p.id, p, conv: null, ...s });
  }
  return items.sort((a, b) => b.score - a.score || cmpTime(b.conv?.last_in_at, a.conv?.last_in_at)).slice(0, limit);
}
const cmpTime = (a, b) => (a ? new Date(a).getTime() : 0) - (b ? new Date(b).getTime() : 0);

// Etkinlik saatini İstanbul saatiyle "HH:MM"
export function eventTime(iso) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
export function eventDate(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: TZ });
}
export function eventPlace(e) {
  if (e.yer_tipi === 'online') return 'Online';
  return [e.semt, e.adres].filter(Boolean).join(', ') || 'Yüz yüze';
}

// AI istemine doğru bilgi olarak verilecek etkinlik özeti
export function eventFacts(events = [], pid = null) {
  if (!events.length) return '';
  return events.map(e => {
    const mine = pid && (e.katilimcilar || []).find(k => k.prospect_id === pid);
    return `- ${e.baslik}: ${eventDate(e.tarih_saat)} saat ${eventTime(e.tarih_saat)}${e.bitis_saat ? '–' + eventTime(e.bitis_saat) : ''}, ${eventPlace(e)}${mine ? ` (bu kişi kayıtlı: ${mine.durum}, ${mine.kisi} kişi)` : ''}`;
  }).join('\n');
}

// 9) Yanlış bilgi kontrolü: metindeki saat, kişinin kayıtlı olduğu (ya da tek) etkinlikle uyuşuyor mu?
export function eventMismatch(text, events = [], pid = null) {
  const times = [...String(text || '').matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
  if (!times.length || !events.length) return [];
  const relevant = events.filter(e => (e.katilimcilar || []).some(k => k.prospect_id === pid));
  const pool = relevant.length ? relevant : (events.length === 1 ? events : []);
  if (!pool.length) return [];
  const valid = new Set(pool.flatMap(e => [eventTime(e.tarih_saat), e.bitis_saat ? eventTime(e.bitis_saat) : null]).filter(Boolean));
  const bad = times.filter(t => !valid.has(t));
  return bad.length ? [{ cat: 'Etkinlik bilgisi', hits: bad, tip: `Kayıttaki saat: ${[...valid].join(' / ')} (${pool.map(e => e.baslik).join(', ')}). Saati kontrol et.` }] : [];
}

// C) Günlük kontrol raporu satırları
export function reportRows(r = {}, events = []) {
  const bot = r.bot || {};
  const g = r.giden || {};
  return [
    { icon: 'ti-message-circle', label: 'Yeni gelen mesaj', value: `${r.gelen_mesaj || 0} (${r.gelen_kisi || 0} kişi)` },
    { icon: 'ti-robot', label: 'Bot olayı', value: `${bot.cevap || 0} cevap · ${bot.hata || 0} hata · ${bot.devir || 0} devir`, warn: (bot.hata || 0) > 0 },
    { icon: 'ti-send', label: 'Giden kutusu', value: `${g.gonderildi || 0} gönderildi · ${g.bekliyor || 0} sırada · ${g.onay_bekliyor || 0} onay bekliyor${g.hata ? ` · ${g.hata} hata` : ''}`, warn: (g.hata || 0) > 0 || (g.onay_bekliyor || 0) > 0 },
    { icon: 'ti-user-exclamation', label: 'Devir bekleyen', value: String(r.devir_bekleyen || 0), warn: (r.devir_bekleyen || 0) > 0 },
    ...events.map(e => ({ icon: 'ti-calendar-event', label: 'Yaklaşan etkinlik', value: `${e.baslik} · ${eventDate(e.tarih_saat)} ${eventTime(e.tarih_saat)} · kayıtlı: ${e.kayitli}${e.kontenjan ? '/' + e.kontenjan : ''}` }))
  ];
}

// Gün sonu: bugünkü onay geçmişi ve giden kutusundan özet
export function dayClose(hist = [], outbox = [], now = Date.now()) {
  const today = new Date(now).toDateString();
  const h = hist.filter(x => new Date(x.at).toDateString() === today);
  const o = outbox.filter(x => new Date(x.olusturma).toDateString() === today);
  return {
    onaylanan: h.length,
    gonderildi: h.filter(x => x.status === 'gonderildi').length,
    cevap: h.filter(x => x.status === 'cevap').length,
    vazgecti: h.filter(x => x.status === 'vazgecti').length,
    isaretsiz: h.filter(x => !x.status).length,
    kuyruk: o.length,
    kuyrukBekleyen: o.filter(x => ['bekliyor', 'gonderiliyor', 'onay_bekliyor'].includes(x.durum)).length,
    kuyrukHata: o.filter(x => x.durum === 'hata').length
  };
}

export const OUTBOX_LABEL = { bekliyor: 'Sırada', gonderiliyor: 'Gönderiliyor', gonderildi: 'Gönderildi', onay_bekliyor: 'Panelde onay bekliyor', hata: 'Hata', iptal: 'İptal' };
