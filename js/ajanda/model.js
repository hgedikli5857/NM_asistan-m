// Ajanda: uygulama randevuları, Google Takvim, bot CRM etkinlikleri, takipler, görevler ve içerik planını tek listede birleştirir.

export const KINDS = {
  randevu: { label: 'Randevu', icon: 'ti-calendar-event' },
  google: { label: 'Google Takvim', icon: 'ti-brand-google' },
  etkinlik: { label: 'Etkinlik', icon: 'ti-confetti' },
  takip: { label: 'Takip', icon: 'ti-phone-call' },
  gorev: { label: 'Görev', icon: 'ti-checkbox' },
  icerik: { label: 'İçerik', icon: 'ti-photo' }
};

const APPT_KIND = { sunum: 'Sunum', birebir: 'Birebir', etkinlik: 'Etkinlik', egitim: 'Eğitim', diger: 'Randevu' };
const FORMAT = { karusel: 'Karusel', reels: 'Reels', gonderi: 'Gönderi', hikaye: 'Hikâye' };
const POST_ST = { fikir: 'Konu', taslak: 'Üretimde', hazir: 'Hazır', paylasildi: 'Paylaşıldı' };
const CRM_TUR = { online_sunum: 'Online sunum', tanisma_toplantisi: 'Tanışma toplantısı', egitim: 'Eğitim', diger: 'Etkinlik' };

// Cihazın yerel günü (YYYY-MM-DD)
export function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const fromDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromDay(k); d.setDate(d.getDate() + n); return dayKey(d); };

// Kişi adlarını başlıkta aramak için dizin (en az iki kelimelik adlar)
export const normName = t => String(t || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export function nameIndex(prospects = []) {
  return prospects.map(p => ({ id: p.id, n: normName(p.full_name) }))
    .filter(x => x.n.split(' ').length >= 2 && x.n.length >= 5)
    .sort((a, b) => b.n.length - a.n.length);
}
export function matchProspect(title, index) {
  const t = ` ${normName(title)} `;
  const hit = index.find(x => t.includes(` ${x.n} `));
  return hit ? hit.id : null;
}

export function buildAgenda(src = {}, { now = new Date(), days = 14, from = null } = {}) {
  const today = dayKey(now);
  const first = from ? dayKey(from) : today;
  const last = addDays(first, days - 1);
  const inWin = k => k >= first && k <= last;
  const todayIn = inWin(today);
  const idx = src.nameIndex || [];
  const items = [];

  for (const a of src.appts || []) {
    if (a.status === 'iptal') continue;
    const s = new Date(a.starts_at);
    const k = dayKey(s); if (!inWin(k)) continue;
    items.push({
      kind: 'randevu', key: 'ap:' + a.id, day: k, start: s,
      end: new Date(s.getTime() + (a.duration_min || 60) * 60000),
      title: `${APPT_KIND[a.kind] || 'Randevu'}: ${a.title || a.prospect_name || ''}`.replace(/: $/, ''),
      sub: [a.prospect_name && a.title ? a.prospect_name : '', a.location, a.is_team_event ? 'Ekip etkinliği' : ''].filter(Boolean).join(' · '),
      done: a.status === 'yapildi', href: '#/ekip?tab=takvim', pid: a.prospect_id || null, ref: a.id, status: a.status
    });
  }

  for (const g of src.gEvents || []) {
    const s = new Date(g.starts_at), e = g.ends_at ? new Date(g.ends_at) : s;
    if (g.all_day) {
      // Çok günlük tüm gün etkinlikleri her güne yaz (bitiş günü hariç)
      let k = dayKey(s); const endK = dayKey(new Date(e.getTime() - 1));
      for (let i = 0; i < 40 && k <= endK; i++, k = addDays(k, 1)) {
        if (inWin(k)) items.push({ kind: 'google', key: `gg:${g.ext_id}:${k}`, day: k, allDay: true, start: fromDay(k), title: g.title, sub: g.location || '', note: g.description || '', pid: matchProspect(g.title, idx) });
      }
      continue;
    }
    const k = dayKey(s); if (!inWin(k)) continue;
    items.push({ kind: 'google', key: 'gg:' + g.ext_id, day: k, start: s, end: e, title: g.title, sub: g.location || '', note: g.description || '', pid: matchProspect(g.title, idx) });
  }

  for (const c of src.crmEvents || []) {
    const s = new Date(c.tarih_saat);
    const k = dayKey(s); if (!inWin(k)) continue;
    const yer = c.yer_tipi === 'online' ? 'Online' : [c.semt, c.adres].filter(Boolean).join(' · ');
    items.push({
      kind: 'etkinlik', key: 'ce:' + c.id, day: k, start: s, end: c.bitis_saat ? new Date(c.bitis_saat) : null,
      title: c.baslik, sub: [CRM_TUR[c.tur] || 'Etkinlik', yer, c.kayitli ? `${c.kayitli} kayıtlı${c.kontenjan ? ' / ' + c.kontenjan : ''}` : ''].filter(Boolean).join(' · '),
      link: c.online_baglanti || '', href: '#/iletisim'
    });
  }

  // Takipler: her gün tek satır; gecikmişler bugüne
  const fu = {};
  for (const p of src.prospects || []) {
    if (!p.next_follow_up_at) continue;
    const k0 = dayKey(new Date(p.next_follow_up_at));
    const late = k0 < today, k = late ? today : k0;
    if (!inWin(k) || (late && !todayIn)) continue;
    (fu[k] ||= []).push({ id: p.id, name: p.full_name, late });
  }
  for (const [k, list] of Object.entries(fu)) {
    list.sort((a, b) => (b.late - a.late) || a.name.localeCompare(b.name, 'tr'));
    const lateN = list.filter(x => x.late).length;
    items.push({
      kind: 'takip', key: 'tk:' + k, day: k, allDay: true, start: fromDay(k),
      title: `Takip: ${list.length} kişi${lateN ? ` (${lateN} gecikmiş)` : ''}`,
      sub: list.slice(0, 6).map(x => x.name).join(', ') + (list.length > 6 ? ` +${list.length - 6}` : ''),
      late: lateN > 0, href: '#/iletisim', people: list
    });
  }

  for (const t of src.tasks || []) {
    if (t.done_at || !t.due_date) continue;
    const late = t.due_date < today, k = late ? today : t.due_date;
    if (!inWin(k) || (late && !todayIn)) continue;
    items.push({ kind: 'gorev', key: 'gt:' + t.id, day: k, allDay: true, start: fromDay(k), title: t.title, sub: t.prospect_name || '', late, href: '#/kazanim', pid: t.prospect_id || null });
  }

  for (const c of src.posts || []) {
    if (!c.planned_for || !inWin(c.planned_for)) continue;
    const t = /^\d{2}:\d{2}/.test(c.post_time || '') ? c.post_time.slice(0, 5) : null;
    const st = fromDay(c.planned_for);
    if (t) st.setHours(+t.slice(0, 2), +t.slice(3, 5), 0, 0);
    items.push({
      kind: 'icerik', key: 'ic:' + c.id, day: c.planned_for, allDay: !t, start: st, end: t ? new Date(st.getTime() + 30 * 6e4) : null,
      title: `${FORMAT[c.format] || 'İçerik'}: ${c.topic || 'Paylaşım'}`, sub: [POST_ST[c.status] || c.status].filter(Boolean).join(' · '),
      done: !!c.published_at || c.status === 'paylasildi', href: '#/pazarlama?uret=' + c.id, ref: c.id, format: c.format
    });
  }

  const order = { takip: 0, gorev: 1, icerik: 2 };
  items.sort((a, b) => a.day.localeCompare(b.day)
    || (!!b.allDay - !!a.allDay)
    || (a.allDay ? (order[a.kind] ?? 3) - (order[b.kind] ?? 3) : a.start - b.start)
    || a.title.localeCompare(b.title, 'tr'));
  return items;
}

export function groupByDay(items, { now = new Date(), days = 14, keepToday = true } = {}) {
  const today = dayKey(now);
  const out = [];
  for (let i = 0; i < days; i++) {
    const k = addDays(today, i);
    const list = items.filter(x => x.day === k);
    if (list.length || (keepToday && i === 0)) out.push({ day: k, label: dayLabel(k, now), items: list, today: i === 0 });
  }
  return out;
}

export function dayLabel(k, now = new Date()) {
  const today = dayKey(now);
  const d = fromDay(k);
  const long = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (k === today) return `Bugün · ${long}`;
  if (k === addDays(today, 1)) return `Yarın · ${long}`;
  return long.charAt(0).toLocaleUpperCase('tr') + long.slice(1);
}

export function timeLabel(it) {
  if (it.allDay) return 'Gün boyu';
  const f = d => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return it.end && it.end > it.start && dayKey(it.end) === it.day ? `${f(it.start)}–${f(it.end)}` : f(it.start);
}

// Şu an süren ya da bir sonraki saatli öğe (Panel kartı için)
export function nextUp(items, now = new Date()) {
  return items.find(x => !x.allDay && (x.end || x.start) >= now) || null;
}

export { addDays, fromDay };

// Haftanın pazartesisi
export function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Görünüm aralığı: { from: Date, days }
export function viewRange(mode, anchor) {
  const a = new Date(anchor); a.setHours(0, 0, 0, 0);
  if (mode === 'gun') return { from: a, days: 1 };
  if (mode === 'hafta') return { from: weekStart(a), days: 7 };
  if (mode === 'ay') {
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const from = weekStart(first);
    const lastDay = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    const end = weekStart(lastDay); end.setDate(end.getDate() + 7);
    return { from, days: Math.round((end - from) / 864e5) };
  }
  return { from: a, days: 7 };
}

export function shiftAnchor(mode, anchor, dir) {
  const a = new Date(anchor);
  if (mode === 'gun') a.setDate(a.getDate() + dir);
  else if (mode === 'hafta' || mode === 'liste') a.setDate(a.getDate() + 7 * dir);
  else { a.setDate(1); a.setMonth(a.getMonth() + dir); }
  return a;
}

// Saatli öğelerin gün içindeki yerleşimi: üst/yükseklik (dakika, görünür aralığa kırpılmış) ve çakışma sütunları
export function layoutDay(items, { startHour = 8, endHour = 22 } = {}) {
  const lo = startHour * 60, hi = endHour * 60;
  const ev = items.filter(x => !x.allDay).map(x => {
    const s = x.start.getHours() * 60 + x.start.getMinutes();
    const e0 = x.end && x.end > x.start ? (dayKey(x.end) === x.day ? x.end.getHours() * 60 + x.end.getMinutes() : 24 * 60) : s + 30;
    const e = Math.max(e0, s + 15);
    const top = Math.min(Math.max(s, lo), hi - 15), bottom = Math.max(Math.min(e, hi), top + 15);
    return { it: x, s, e, top: top - lo, height: bottom - top, before: s < lo, after: s >= hi };
  }).sort((a, b) => a.top - b.top || b.height - a.height);
  // Çakışan gruplar → sütunlar
  let group = [], groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map(g => g.col)) + 1; group.forEach(g => { g.cols = n; }); group = []; };
  for (const g of ev) {
    if (group.length && g.top >= groupEnd) flush();
    const used = new Set(group.filter(o => o.top + o.height > g.top).map(o => o.col));
    let c = 0; while (used.has(c)) c++;
    g.col = c; group.push(g); groupEnd = Math.max(groupEnd, g.top + g.height);
  }
  if (group.length) flush();
  return ev;
}
