// Uygulama → Google Takvim köprüsü: Apps Script şablonu ve eşitleme planı.
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Akıştaki öğeler ile takvimdeki etkinlikleri karşılaştırıp yapılacakları çıkarır.
// existing: { [nmd_id]: imza }, items: [{id, ...}], sign: öğe → imza
export function planSync(existing, items, sign) {
  const create = [], update = [], keep = [], seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const h = sign(it);
    if (!(it.id in existing)) create.push(it);
    else if (existing[it.id] !== h) update.push(it);
    else keep.push(it.id);
  }
  const remove = Object.keys(existing).filter(id => !seen.has(id));
  return { create, update, keep, remove };
}

export function appsScript(token) {
  return `// NM Departmanı → Google Takvim köprüsü
// Kurulum: script.google.com → Yeni proje → bu kodu yapıştır → Kaydet → "kur" fonksiyonunu seç → Çalıştır → izin ver.
// Uygulamadakiler "NM Departmanı" adlı ayrı bir takvime yazılır; kendi takvimine dokunulmaz.
// Kendi takvimindeki etkinlikler (yalnızca okunur) uygulamanın Ajanda'sında görünür. 15 dakikada bir güncellenir.
const NMD_URL = '${SUPABASE_URL}/rest/v1/rpc/gcal_feed';
const NMD_KEY = '${SUPABASE_KEY}';
const NMD_TOKEN = '${token}';
const TAKVIM_ADI = 'NM Departmanı';

${planSync.toString().replace('export ', '')}

function takvim_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CAL_ID');
  let cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.getCalendarsByName(TAKVIM_ADI)[0] || CalendarApp.createCalendar(TAKVIM_ADI, { color: CalendarApp.Color.YELLOW });
    props.setProperty('CAL_ID', cal.getId());
  }
  return cal;
}

function gun_(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function imza_(it) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(it), Utilities.Charset.UTF_8));
}

function olustur_(cal, it) {
  const opt = { description: it.description || '', location: it.location || '' };
  const ev = it.type === 'timed'
    ? cal.createEvent(it.title, new Date(it.start), new Date(it.end), opt)
    : cal.createAllDayEvent(it.title, gun_(it.date), opt);
  ev.removeAllReminders();
  if (it.reminder) ev.addPopupReminder(it.reminder);
  ev.setTag('nmd_id', it.id);
  ev.setTag('nmd_h', imza_(it));
}

// Kendi (birincil) Google takviminden etkinlikleri uygulamanın Ajanda'sına gönderir
function ajandayaGonder_() {
  const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime()); to.setDate(to.getDate() + 67);
  const evs = CalendarApp.getDefaultCalendar().getEvents(from, to)
    .filter(ev => !ev.getTag('nmd_id')).slice(0, 500)
    .map(ev => ({
      id: ev.getId() + '@' + ev.getStartTime().getTime(),
      title: ev.getTitle(), start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(), location: ev.getLocation() || '', description: (ev.getDescription() || '').slice(0, 2000)
    }));
  const res = UrlFetchApp.fetch(NMD_URL.replace('gcal_feed', 'gcal_push'), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: NMD_KEY, Authorization: 'Bearer ' + NMD_KEY },
    payload: JSON.stringify({ p_token: NMD_TOKEN, p_from: from.toISOString(), p_to: to.toISOString(), p_events: evs })
  });
  console.log("Ajanda'ya gönderilen Google etkinliği: " + evs.length + ' (' + res.getResponseCode() + ')');
}

function senkronize() {
  try { ajandayaGonder_(); } catch (e) { console.error('Ajanda gönderimi: ' + e); }
  const res = UrlFetchApp.fetch(NMD_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: NMD_KEY, Authorization: 'Bearer ' + NMD_KEY },
    payload: JSON.stringify({ p_token: NMD_TOKEN })
  });
  if (res.getResponseCode() !== 200) throw new Error('Akış alınamadı: ' + res.getContentText());
  const feed = JSON.parse(res.getContentText());
  const cal = takvim_();
  const evs = {}, existing = {};
  cal.getEvents(gun_(feed.from), gun_(feed.to)).forEach(ev => {
    const id = ev.getTag('nmd_id');
    if (!id) return;
    if (evs[id]) { ev.deleteEvent(); return; }          // kopya varsa temizle
    evs[id] = ev; existing[id] = ev.getTag('nmd_h');
  });
  const plan = planSync(existing, feed.items, imza_);
  plan.update.forEach(it => { evs[it.id].deleteEvent(); olustur_(cal, it); });
  plan.create.forEach(it => olustur_(cal, it));
  plan.remove.forEach(id => evs[id].deleteEvent());
  console.log('Yeni: ' + plan.create.length + ' · Güncellenen: ' + plan.update.length + ' · Silinen: ' + plan.remove.length + ' · Aynı: ' + plan.keep.length);
}

function kur() {
  durdur();
  ScriptApp.newTrigger('senkronize').timeBased().everyMinutes(15).create();
  senkronize();
  console.log('Hazır: takvim 15 dakikada bir güncellenecek.');
}

function durdur() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'senkronize').forEach(t => ScriptApp.deleteTrigger(t));
}
`;
}
