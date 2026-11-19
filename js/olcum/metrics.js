// Ölçüm birimi: KPI hesapları (saf fonksiyonlar, tarayıcı dışında test edilebilir)
//
// Tanımlar:
//  yeni temas = bir adayla ilk kez kaydedilen mesaj/arama/yüz yüze görüşme
//  takip      = aynı adayla sonraki mesaj/arama/yüz yüze görüşmeler
//  davet      = adayın "Davet" aşamasına geçişi
//  sunum      = "Sunum" kaydı ya da "Sunum" aşamasına geçiş (aynı gün, aynı aday bir kez sayılır)
//  yeni aday  = listeye eklenen kişi

const CONTACT_KINDS = new Set(['mesaj', 'arama', 'yuz_yuze', 'sunum']);

export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function weekStart(now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Pazartesi = 0
  d.setDate(d.getDate() - dow);
  return d;
}

export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function lastDays(n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); out.push(dayKey(d)); }
  return out;
}

const empty = () => ({ yeniTemas: 0, takip: 0, davet: 0, sunum: 0, yeniAday: 0, kazanilan: 0 });

// Gün gün metrikler: { 'YYYY-MM-DD': {yeniTemas, takip, davet, sunum, yeniAday, kazanilan} }
export function dailyMetrics({ interactions = [], stageEvents = [], prospects = [] }) {
  const days = {};
  const get = k => (days[k] ||= empty());

  const sorted = [...interactions].filter(i => CONTACT_KINDS.has(i.kind))
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const seen = new Set();
  const sunumSeen = new Set(); // gün|aday
  for (const i of sorted) {
    const k = dayKey(i.occurred_at);
    if (i.kind === 'sunum') {
      const key = k + '|' + i.prospect_id;
      if (!sunumSeen.has(key)) { sunumSeen.add(key); get(k).sunum++; }
    } else if (seen.has(i.prospect_id)) get(k).takip++;
    else get(k).yeniTemas++;
    seen.add(i.prospect_id);
  }

  for (const e of stageEvents) {
    if (!e.from_stage) continue; // ilk kayıt bir geçiş değildir
    const k = dayKey(e.occurred_at);
    if (e.to_stage === 'davet') get(k).davet++;
    if (e.to_stage === 'sunum') {
      const key = k + '|' + e.prospect_id;
      if (!sunumSeen.has(key)) { sunumSeen.add(key); get(k).sunum++; }
    }
    if ((e.to_stage === 'musteri' || e.to_stage === 'is_ortagi') && !['musteri', 'is_ortagi'].includes(e.from_stage)) get(k).kazanilan++;
  }

  for (const p of prospects) get(dayKey(p.created_at)).yeniAday++;
  return days;
}

export function sumRange(days, keys) {
  const total = empty();
  for (const k of keys) {
    const d = days[k]; if (!d) continue;
    for (const f of Object.keys(total)) total[f] += d[f];
  }
  return total;
}

export function keysBetween(start, end = new Date()) {
  const out = []; const d = new Date(start); d.setHours(12, 0, 0, 0);
  const last = dayKey(end);
  while (dayKey(d) <= last) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
  return out;
}

// Art arda aktif gün sayısı (bugün henüz aktivite yoksa dünden geriye sayar)
export function activeStreak(days, now = new Date()) {
  const active = k => { const d = days[k]; return !!d && d.yeniTemas + d.takip + d.sunum > 0; };
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  if (!active(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (active(dayKey(d)) && n < 3650) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function pct(value, target) {
  if (!target) return value > 0 ? 100 : 0;
  return Math.min(100, Math.round((value / target) * 100));
}

export function formatTL(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);
}

// Haftalık özet metni: hesap verme formunu otomatik doldurmak için
export function weekSummary(total, targets) {
  return `Yeni temas: ${total.yeniTemas} · Takip: ${total.takip} · Davet: ${total.davet}/${targets.weekly_invites} · ` +
    `Sunum: ${total.sunum}/${targets.weekly_presentations} · Yeni aday: ${total.yeniAday} · Kazanılan: ${total.kazanilan}`;
}
