// Kazanım birimi: sabitler ve saf (veritabanına dokunmayan) yardımcı fonksiyonlar.
// Bu dosya tarayıcı dışında da test edilebilir.

export const STAGES = [
  { id: 'liste', label: 'Liste' },
  { id: 'temas', label: 'Temas' },
  { id: 'davet', label: 'Davet' },
  { id: 'sunum', label: 'Sunum' },
  { id: 'takip', label: 'Takip' },
  { id: 'musteri', label: 'Müşteri' },
  { id: 'is_ortagi', label: 'İş ortağı' },
  { id: 'pasif', label: 'Pasif' }
];
export const ACTIVE_STAGES = ['liste', 'temas', 'davet', 'sunum', 'takip'];
export const stageLabel = id => STAGES.find(s => s.id === id)?.label || id;

export const TEMPS = {
  sicak: { label: 'Sıcak', cls: 'hot' },
  ilik: { label: 'Ilık', cls: 'warm' },
  soguk: { label: 'Soğuk', cls: 'cold' }
};

export const KINDS = { mesaj: 'Mesaj', arama: 'Arama', yuz_yuze: 'Yüz yüze', sunum: 'Sunum', not: 'Not' };
export const CHANNELS = ['WhatsApp', 'Instagram', 'Telefon', 'Yüz yüze', 'Facebook', 'LinkedIn', 'Diğer'];
export const SOURCES = ['Sıcak liste', 'Sosyal medya', 'Referans', 'Etkinlik', 'Web sitesi', 'Diğer'];

export const QUIET_DAYS = 5; // bu kadar gün temas yoksa "sessiz" sayılır
const DAY = 864e5;

// ---------- Tarih ----------
export function endOfToday(now = new Date()) {
  const d = new Date(now); d.setHours(23, 59, 59, 999); return d;
}
export function addDays(days, now = new Date()) {
  const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); return d;
}
export function daysBetween(a, b = new Date()) {
  return Math.floor((new Date(b) - new Date(a)) / DAY);
}
export function relativeDay(iso, now = new Date()) {
  if (!iso) return '';
  const start = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const diff = Math.round((start(iso) - start(now)) / DAY);
  if (diff === 0) return 'bugün';
  if (diff === 1) return 'yarın';
  if (diff === -1) return 'dün';
  if (diff < 0) return `${-diff} gün önce`;
  if (diff < 7) return `${diff} gün sonra`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
// "19.11.2026" → Date (eski uygulamanın tarih biçimi)
export function parseTrDate(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], 12);
  return isNaN(d) ? null : d;
}

// ---------- Telefon ----------
// Türkiye numaralarını WhatsApp için 90XXXXXXXXXX biçimine çevirir
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d.length >= 10 ? d : null;
}

// ---------- Bugün listesi ----------
export function isOpen(p) { return ACTIVE_STAGES.includes(p.stage); }

export function dueFollowUps(prospects, now = new Date()) {
  const end = endOfToday(now);
  return prospects
    .filter(p => p.next_follow_up_at && new Date(p.next_follow_up_at) <= end && p.stage !== 'pasif')
    .sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at));
}

export function quietHotProspects(prospects, now = new Date()) {
  return prospects.filter(p => {
    if (p.temperature !== 'sicak' || !isOpen(p)) return false;
    if (p.next_follow_up_at && new Date(p.next_follow_up_at) > now) return false; // zaten planlı
    if (p.next_follow_up_at && new Date(p.next_follow_up_at) <= endOfToday(now)) return false; // takip listesinde
    const last = p.last_contact_at || p.created_at;
    return daysBetween(last, now) >= QUIET_DAYS;
  });
}

// ---------- Filtre ----------
export function filterProspects(list, { q = '', temp = '', stage = '', tag = '' } = {}) {
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  return list.filter(p => {
    if (temp && p.temperature !== temp) return false;
    if (stage && p.stage !== stage) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    if (!needle) return true;
    return [p.full_name, p.phone, p.instagram, p.notes, p.occupation, p.interests, (p.tags || []).join(' ')]
      .some(v => String(v || '').toLocaleLowerCase('tr-TR').includes(needle));
  });
}

// Listede geçen etiketler ve kaç adayda olduğu (çoktan aza)
export function tagCounts(list) {
  const m = new Map();
  list.forEach(p => (p.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// "!, öncelikli , aile" → ['!', 'öncelikli', 'aile']
export function parseTags(text) {
  return [...new Set(String(text || '').split(',').map(t => t.trim()).filter(Boolean).map(t => t.slice(0, 30)))].slice(0, 10);
}

export function countByStage(list) {
  const out = Object.fromEntries(STAGES.map(s => [s.id, 0]));
  list.forEach(p => { if (p.stage in out) out[p.stage]++; });
  return out;
}

// ---------- Eski NM Asistanı'ndan içe aktarma ----------
export const LEGACY_KEY = 'nma_standalone';
const LEGACY_STAGES = ['liste', 'temas', 'davet', 'sunum', 'is_ortagi']; // eski: Temas yok … Ekipte

export function readLegacy(storage) {
  try {
    const raw = JSON.parse(storage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(p => p && String(p.isim || '').trim()) : [];
  } catch { return []; }
}

// Not: Sağlık bilgisi, gelir ve sağlığa göre ürün önerisi KVKK'da hassas / özel nitelikli
// veri sayılabileceği için buluta taşınmaz; eski uygulamada kalır.
export function mapLegacy(p, orgId) {
  const clean = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
  const extra = {};
  for (const [k, v] of Object.entries({ whatsapp: p.wa, facebook: p.fb, diger_iletisim: p.diger, medeni_durum: p.medeni, cocuk: p.cocuk })) {
    if (clean(v)) extra[k] = clean(v);
  }
  const created = parseTrDate(p.tarih);
  const row = {
    org_id: orgId,
    legacy_id: String(p.id ?? `${p.isim}-${p.tarih}`),
    full_name: String(p.isim).trim(),
    phone: clean(p.tel) || clean(p.wa),
    instagram: clean(p.ig),
    channel: clean(p.kanal),
    source: 'Eski NM Asistanı',
    stage: LEGACY_STAGES[+p.asama] || 'liste',
    temperature: TEMPS[p.liste] ? p.liste : 'ilik',
    occupation: clean(p.meslek),
    interests: clean(p.ilgi),
    notes: clean(p.not),
    tags: /^\s*!/.test(String(p.isim)) ? ['!'] : [],
    extra
  };
  if (created) row.created_at = created.toISOString();
  return row;
}
