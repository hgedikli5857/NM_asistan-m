// Ajanda: uygulama randevuları, Google Takvim, bot CRM etkinlikleri, takipler, görevler ve içerik planını tek listede birleştirir.

export const KINDS = {
  randevu: { label: 'Randevu', icon: 'ti-calendar-event' },
  google: { label: 'Google Takvim', icon: 'ti-brand-google' },
  etkinlik: { label: 'Etkinlik', icon: 'ti-confetti' },
  takip: { label: 'Takip', icon: 'ti-phone-call' },
  gorev: { label: 'Görev', icon: 'ti-checkbox' },
  icerik: { label: 'İçerik', icon: 'ti-photo' }
};

const APPT_KIND = { sunum: 'Sunum', birebir: 'Birebir', etkinlik: 'Etkinlik', egitim: 'Eğitim', toplanti: 'Toplantı' };
const FORMAT = { karusel: 'Karusel', reels: 'Reels', gonderi: 'Gönderi', hikaye: 'Hikâye' };
const POST_ST = { taslak: 'Taslak', hazir: 'Hazır', yayinda: 'Yayında', planli: 'Planlı' };
const CRM_TUR = { online_sunum: 'Online sunum', tanisma_toplantisi: 'Tanışma toplantısı', egitim: 'Eğitim', diger: 'Etkinlik' };

// Cihazın yerel günü (YYYY-MM-DD)
export function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const fromDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromDay(k); d.setDate(d.getDate() + n); return dayKey(d); };

export function buildAgenda(src = {}, { now = new Date(), days = 14 } = {}) {
  const today = dayKey(now);
  const last = addDays(today, days - 1);
  const inWin = k => k >= today && k <= last;
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
      done: a.status === 'yapildi', href: '#/ekip?tab=takvim'
    });
  }

  for (const g of src.gEvents || []) {
    const s = new Date(g.starts_at), e = g.ends_at ? new Date(g.ends_at) : s;
    if (g.all_day) {
      // Çok günlük tüm gün etkinlikleri her güne yaz (bitiş günü hariç)
      let k = dayKey(s); const endK = dayKey(new Date(e.getTime() - 1));
      for (let i = 0; i < 40 && k <= endK; i++, k = addDays(k, 1)) {
        if (inWin(k)) items.push({ kind: 'google', key: `gg:${g.ext_id}:${k}`, day: k, allDay: true, start: fromDay(k), title: g.title, sub: g.location || '', note: g.description || '' });
      }
      continue;
    }
    const k = dayKey(s); if (!inWin(k)) continue;
    items.push({ kind: 'google', key: 'gg:' + g.ext_id, day: k, start: s, end: e, title: g.title, sub: g.location || '', note: g.description || '' });
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
    if (!inWin(k)) continue;
    (fu[k] ||= []).push({ name: p.full_name, late });
  }
  for (const [k, list] of Object.entries(fu)) {
    list.sort((a, b) => (b.late - a.late) || a.name.localeCompare(b.name, 'tr'));
    const lateN = list.filter(x => x.late).length;
    items.push({
      kind: 'takip', key: 'tk:' + k, day: k, allDay: true, start: fromDay(k),
      title: `Takip: ${list.length} kişi${lateN ? ` (${lateN} gecikmiş)` : ''}`,
      sub: list.slice(0, 6).map(x => x.name).join(', ') + (list.length > 6 ? ` +${list.length - 6}` : ''),
      late: lateN > 0, href: '#/iletisim'
    });
  }

  for (const t of src.tasks || []) {
    if (t.done_at || !t.due_date) continue;
    const late = t.due_date < today, k = late ? today : t.due_date;
    if (!inWin(k)) continue;
    items.push({ kind: 'gorev', key: 'gt:' + t.id, day: k, allDay: true, start: fromDay(k), title: t.title, sub: t.prospect_name || '', late, href: '#/kazanim' });
  }

  for (const c of src.posts || []) {
    if (!c.planned_for || !inWin(c.planned_for)) continue;
    items.push({
      kind: 'icerik', key: 'ic:' + c.id, day: c.planned_for, allDay: true, start: fromDay(c.planned_for),
      title: c.topic || 'Paylaşım', sub: [FORMAT[c.format] || c.format, POST_ST[c.status] || c.status].filter(Boolean).join(' · '),
      done: !!c.published_at || c.status === 'yayinda', href: '#/pazarlama'
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
