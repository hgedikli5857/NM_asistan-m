import assert from 'node:assert/strict';
// picker.js ui.js'i içe aktarır; ui.js tarayıcıya bağımlı değil
import { searchProspects } from '../js/ui/picker.js';
const ps = [
  { id: 1, full_name: '!Murat Çetin', phone: '0532 111 22 33' },
  { id: 2, full_name: 'Ayşe Murat' },
  { id: 3, full_name: '!MuratSoba' },
  { id: 4, full_name: 'Şule Öztürk', instagram: '@suleoz' },
  ...Array.from({ length: 1600 }, (_, i) => ({ id: 100 + i, full_name: 'Kişi ' + i }))
];
assert.deepEqual(searchProspects(ps, 'murat').map(p => p.id), [1, 3, 2], 'baştan eşleşenler önce, ! yok sayılır');
assert.deepEqual(searchProspects(ps, 'cetin').map(p => p.id), [1], 'Türkçe karakter duyarsız');
assert.deepEqual(searchProspects(ps, 'sule').map(p => p.id), [4]);
assert.deepEqual(searchProspects(ps, '111 22').map(p => p.id), [1], 'telefonla');
assert.equal(searchProspects(ps, 'kişi').length, 8, 'en fazla 8 sonuç');
assert.deepEqual(searchProspects(ps, '  '), []);
console.log('seçici testleri geçti');
