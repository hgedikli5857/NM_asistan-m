// Google Form → Kazanım köprüsü: Apps Script şablonu ve başlık eşleme.
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Başlık → alan eşlemesi (Apps Script içinde de aynı mantık çalışır; burada test edilebilir)
export function mapRow(headers, values) {
  const row = { name: '', phone: '', email: '', age: '', occupation: '', interest: '', ts: '', answers: {} };
  const interest = [];
  headers.forEach((h, i) => {
    const raw = String(h || '').trim();
    const k = raw.toLocaleLowerCase('tr');
    const v = String(values[i] ?? '').trim();
    if (!raw || !v) return;
    if (/^column \d+$|sütun$/.test(k)) return;
    if (/gelir hedef|gelir aral/.test(k)) return;               // hassas: hiç gönderilmez
    if (k.includes('zaman damgası') || k === 'timestamp') row.ts = v;
    else if (k.includes('ad') && k.includes('soyad')) row.name = v;
    else if (k.includes('numara') || k.includes('telefon')) row.phone = v;
    else if (k.includes('e-posta') || k.includes('email')) row.email = v;
    else if (/^yaşınız|^yaş$/.test(k)) row.age = v;
    else if (k.includes('meslek')) row.occupation = v;
    else {
      if (k.includes('hangi konuda bilgi') || k.includes('yaşam kalitenizde')) interest.push(v);
      row.answers[raw.split('\n')[0].slice(0, 200)] = v;
    }
  });
  row.interest = interest.join(' · ');
  return row;
}

export function appsScript(token) {
  return `// NM Departmanı — Google Form köprüsü
// Kurulum: Bu kodu yapıştır → Kaydet → üstten "kur" fonksiyonunu seç → Çalıştır → izin ver.
const NMD_URL = '${SUPABASE_URL}/rest/v1/rpc/gform_ingest';
const NMD_KEY = '${SUPABASE_KEY}';
const NMD_TOKEN = '${token}';

${mapRow.toString().replace('export ', '')}

function gonder_(row) {
  const res = UrlFetchApp.fetch(NMD_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: NMD_KEY, Authorization: 'Bearer ' + NMD_KEY },
    payload: JSON.stringify({ p_token: NMD_TOKEN, p_row: row })
  });
  console.log(row.name + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
}

function formGonderildi(e) {
  const sh = e.range.getSheet();
  const n = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, n).getDisplayValues()[0];
  const values = sh.getRange(e.range.getRow(), 1, 1, n).getDisplayValues()[0];
  gonder_(mapRow(headers, values));
}

function kur() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'formGonderildi').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('formGonderildi').forSpreadsheet(ss).onFormSubmit().create();
  console.log('Hazır: yeni form yanıtları uygulamaya düşecek.');
}
`;
}
