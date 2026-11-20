// Mesaj Üretim Stratejisi — WhatsApp CRM'de kullanılan kuralların uygulama karşılığı.
// Uygulama metin ÜRETİR; gönderimi her zaman kullanıcı onaylayıp kendisi yapar.

// 2) Marka filtresi — AI'ya verilen kurallar (çıkış kontrolü uyum.js içinde)
export const BRAND_RULES = `MARKA KURALLARI (kesinlikle uy):
- "network marketing", "MLM", "çok katmanlı", "ponzi" deme; gerekiyorsa yalnızca "bireysel girişimcilik" de.
- Kazanç, gelir, rakam, "kazanç planı", "hacim", "prim" gibi ifadeler kullanma.
- Sağlık: tedavi, iyileşme, hastalık adı, kesin etki iddiası yok. Ürünü "patch" diye an, "bant" deme.
- Abartı yok, "garanti" yok, "fırsat kaçıyor" gibi baskı veren aciliyet yok.
- Mesajın sonunda kişiye kolay bir çıkış bırak (ör. "uygun değilse hiç sorun değil").
- Dil sade, samimi, Türkçe; teknik terim yok. Mesaj kısa: en fazla 3 kısa cümle.`;

// 4) Senaryo çerçevesi
export const SCENARIOS = {
  auto:     { label: 'Sen karar ver', count: 3, approach: 'Durumu oku, aşağıdaki senaryolardan en uygununu seç ve ona göre yaz.' },
  takip:    { label: 'Takip (cevap yok)', count: 1, approach: 'Yeni ve somut bir sebep (etkinlik, yeni bilgi) ile kısa bir mesaj. Suçlama yok, "neden dönmedin" yok.' },
  ilgili:   { label: 'İlgili, almak istiyor', count: 1, approach: 'Küçük ve uygun bir seçenekle başlat; mesaj bir seçim sorusu olsun (ör. "şununla mı başlayalım, bununla mı?"). Ödemeyi kişinin kendi düzenine bırak.' },
  erteleme: { label: 'Ertelemek istiyor', count: 1, approach: 'Anlayış göster, uygun olacağı bir tarih sor. Tarih vermezse konuyu nazikçe kapat.' },
  kararsiz: { label: 'Kararsız', count: 1, approach: 'Tek, yumuşak bir takip mesajı. Israr yok; sonrasında beklenir.' },
  vazgecti: { label: 'Vazgeçti / ilgisiz', count: 1, approach: 'Teşekkür et, kapıyı açık bırak. SORU SORMA, ek teklif yapma. Takip durur.' },
  maddi:    { label: 'Maddi zorluk belirtti', count: 1, approach: 'Satış yapma, ürün önerme. Durumu anladığını göster, dinlemeye açık ol; ürün konusunu ileriye ertele.' },
  davet:    { label: 'Görüşmeye davet', count: 3, approach: 'Kısa bir görüşmeye/çaya davet et; iki zaman seçeneği sun.' },
  itiraz:   { label: 'İtirazı yanıtla', count: 3, approach: 'İtirazı anladığını göster, kısa ve dürüst cevap ver, baskı yapma.' }
};

// Takip durması gereken senaryolar
export const STOP_FOLLOWUP = ['vazgecti'];

// 3) Hitap ve gönderen kimliği
export const HITAP = { siz: 'Siz', sen: 'Sen' };
export const SENDERS = { kisisel: 'Kendi telefonumdan (Hakan olarak)', asistan: 'Bot / dijital asistan' };

export function hitapRule(hitap, sender, ownerName = 'Hakan') {
  const h = hitap === 'sen'
    ? 'Kişiye "sen" diye hitap et (yakın tanıdık).'
    : 'Kişiye "siz" diye hitap et; samimi ama saygılı.';
  const s = sender === 'asistan'
    ? `Mesajı "${ownerName} Bey'in dijital asistanı" olarak yaz; kendini böyle tanıt, ${ownerName} adına konuş.`
    : `Mesajı birinci tekil şahısla, doğrudan ${ownerName} yazıyormuş gibi yaz.`;
  return `${h} ${s}`;
}

// Yeni kişi → siz. Rehberdeki kişi → ilişkiye göre; emin değilse siz.
export function defaultHitap(p) {
  return 'siz';
}

// Çalışma dışı gruplar ("!" ön ekli ya da "!" etiketli kişiler) kapsam dışıdır
export function isExcluded(p) {
  if (!p) return false;
  return /^\s*!/.test(p.full_name || '') || (p.tags || []).includes('!');
}

// 5) 24 saat penceresi (yalnızca WhatsApp bot/işletme numarası için geçerli)
export function windowState(p, now = Date.now()) {
  const c = p?.extra?.crm?.conv;
  if (!c) return { known: false };
  const lastIn = c.last_in_at ? new Date(c.last_in_at).getTime() : null;
  if (!lastIn) return { known: true, open: false, lastIn: null };
  const left = lastIn + 24 * 3600e3 - now;
  return { known: true, open: left > 0, lastIn, hoursLeft: Math.max(0, Math.floor(left / 3600e3)), minutesLeft: Math.max(0, Math.floor(left / 60e3)) };
}

// Soğuk kişi: daha önce yazışma kaydı yok
export function isCold(p) {
  if (!p) return false;
  return !p.last_contact_at && !p.extra?.crm?.conv;
}

// Telefonun son 4 hanesi
export const last4 = phone => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '';
};

// 5) Gönderim sınırları: aynı kişiye 10 dakikada 1, günde toplam 30
export const LIMITS = { perPersonMinutes: 10, daily: 30 };
export function checkLimits(log, prospectId, now = Date.now()) {
  const today = new Date(now).toDateString();
  const todays = log.filter(x => new Date(x.at).toDateString() === today);
  if (todays.length >= LIMITS.daily) return { ok: false, reason: `Bugünkü ${LIMITS.daily} mesaj sınırına ulaştın. Yarın devam et.` };
  if (prospectId) {
    const last = log.filter(x => x.pid === prospectId).map(x => x.at).sort((a, b) => b - a)[0];
    if (last && now - last < LIMITS.perPersonMinutes * 60e3) {
      const m = Math.ceil((LIMITS.perPersonMinutes * 60e3 - (now - last)) / 60e3);
      return { ok: false, reason: `Bu kişiye az önce mesaj onayladın. ${m} dakika sonra tekrar dene (10 dakikada en fazla 1 mesaj).` };
    }
  }
  return { ok: true, remaining: LIMITS.daily - todays.length };
}

export function buildReplyPrompt({ scenario = 'auto', input, brief, history, hitap = 'siz', sender = 'kisisel', ownerName = 'Hakan' }) {
  const sc = SCENARIOS[scenario] || SCENARIOS.auto;
  const list = Object.entries(SCENARIOS).filter(([k]) => !['auto', 'davet', 'itiraz'].includes(k))
    .map(([k, v]) => `- ${k} (${v.label}): ${v.approach}`).join('\n');
  const n = sc.count;
  const opts = Array.from({ length: n }, (_, i) => i === 0 ? '{"baslik":"kısa yaklaşım adı","mesaj":"gönderilecek mesaj"}' : '{"baslik":"...","mesaj":"..."}').join(',');
  return `Sen deneyimli ve etik bir bireysel girişimcilik koçusun. ${ownerName} bir kişiyle yazışıyor ve ne yazacağını soruyor. Sen yalnızca metin önerirsin; gönderimi o yapar.
${BRAND_RULES}
HİTAP VE KİMLİK: ${hitapRule(hitap, sender, ownerName)}
SENARYO: ${sc.label}. Yaklaşım: ${sc.approach}
${scenario === 'auto' ? 'Senaryolar:\n' + list : ''}
Kişi: ${brief || 'bilinmiyor'}
${history ? 'Önceki temaslar:\n' + history : ''}
${ownerName}'ın anlattığı durum / kişinin mesajı:
«${input}»
Not: Durumda geçen sağlık, borç, maddi zorluk ya da aile konularını mesajda tekrar etme; yalnızca anlayış göster.

Yalnızca şu JSON ile cevap ver, başka metin yazma:
{"senaryo":"${scenario === 'auto' ? Object.keys(SCENARIOS).filter(k => k !== 'auto').join('|') : scenario}","analiz":"durumun kısa okuması, en fazla 2 kısa cümle","niyet":"ilgili|kararsiz|itiraz|ilgisiz|belirsiz","sicaklik":"sicak|ilik|soguk","secenekler":[${opts}],"sonraki_adim":"tek cümle","takip_gun":0}
secenekler tam ${n} adet olsun; her mesaj en fazla 3 kısa cümle. takip_gun 0-14 arası; vazgecti için 0.`;
}

// Filtreye takılan seçenekleri yeniden yazdırmak için istem
export function rewritePrompt(items, scenario, hitap, sender, ownerName = 'Hakan') {
  return `Aşağıdaki WhatsApp mesajları marka kurallarına takıldı. Her birini anlamını koruyarak kurallara uygun şekilde yeniden yaz.
${BRAND_RULES}
HİTAP VE KİMLİK: ${hitapRule(hitap, sender, ownerName)}
${scenario === 'vazgecti' ? 'Bu kişi vazgeçti: mesajda SORU olmasın.' : ''}
${items.map((x, i) => `${i + 1}) Mesaj: «${x.mesaj}»\n   Sorun: ${x.issues}`).join('\n')}
Yalnızca şu JSON ile cevap ver: {"mesajlar":["...", "..."]} (aynı sırada, ${items.length} adet)`;
}
