// Google Form köprüsü: başlık eşleme ve Apps Script şablonu
import assert from 'node:assert/strict';
import { mapRow, appsScript } from '../js/pazarlama/gform.js';

const h = ['Zaman damgası', ' ADINIZ SOYADINIZ', 'Column 19', 'YAŞINIZ', 'İLETİŞİM NUMARANIZ', 'E-POSTA ADRESİNİZ',
  'MEVCUT MESLEK VEYA İŞ DURUMU', 'Bu modeli değerlendirirken uzun vadeli gelir hedefiniz hangi aralıktadır?\n\n(not)',
  'Takım çalışmasına uyumlu musunuz?', 'Hangi konuda bilgi almak istiyorsunuz?', '20. sütun',
  'Yaşam kalitenizde öncelikle hangi alanları desteklemek istiyorsunuz?'];
const v = ['19.11.2026 14:10:47', 'Ozan D', 'x', '44', '5333662952', 'o@g.com', 'Memur', '10.000 - 25.000 TL', 'Evet', 'Her ikisi', 'y', 'Enerji'];
const r = mapRow(h, v);
assert.equal(r.name, 'Ozan D'); assert.equal(r.phone, '5333662952'); assert.equal(r.age, '44');
assert.equal(r.occupation, 'Memur'); assert.equal(r.ts, '19.11.2026 14:10:47'); assert.equal(r.email, 'o@g.com');
assert.equal(r.interest, 'Her ikisi · Enerji');
assert.ok(!JSON.stringify(r).includes('25.000'), 'gelir hedefi aktarılmamalı');
assert.ok(!Object.values(r.answers).includes('x') && !Object.values(r.answers).includes('y'), 'boş sütunlar atlanmalı');
assert.equal(r.answers['Takım çalışmasına uyumlu musunuz?'], 'Evet');

const code = appsScript('gf_test');
assert.ok(code.includes("NMD_TOKEN = 'gf_test'") && code.includes('function kur()') && code.includes('onFormSubmit'));
new Function(code); // sözdizimi geçerli
console.log('gform: tamam');
