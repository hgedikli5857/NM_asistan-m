import assert from 'node:assert/strict';
import { checkMessage, fillTemplate } from '../js/iletisim/uyum.js';
import { SYSTEM_TEMPLATES, OBJECTIONS } from '../js/iletisim/content.js';
const cats = t => checkMessage(t).map(f => f.cat);
assert.deepEqual(cats('Bu bant ağrıyı geçirir, ilaç yerine kullan'), ['Sağlık iddiası']);
assert.deepEqual(cats('Ayda 30 bin TL kazanırsın, garanti kazanç'), ['Kazanç vaadi']);
assert.deepEqual(cats('Son şans, hemen karar ver'), ['Baskı / acele ettirme']);
assert.deepEqual(cats('%100 doğal ve risksiz'), ['Yanıltıcı kesinlik']);
assert.deepEqual(cats('Merhaba Ayşe, bu hafta kahve içelim mi?'), []);
assert.equal(fillTemplate('Selam {isim}, ben {ben}', { isim: 'Ali', ben: 'Hakan' }), 'Selam Ali, ben Hakan');
// Kendi şablonlarımız kendi kurallarımızdan geçmeli
const bad = [...SYSTEM_TEMPLATES.map(t => [t.id, t.body]), ...OBJECTIONS.map(o => [o.id, o.reply])]
  .filter(([, b]) => checkMessage(b).length).map(([id, b]) => id + ': ' + JSON.stringify(checkMessage(b)));
assert.deepEqual(bad, []);
console.log(`iletişim testleri geçti (${SYSTEM_TEMPLATES.length} şablon, ${OBJECTIONS.length} itiraz temiz)`);
assert.deepEqual(cats('Acele etmelisin, yer kalmadı'), ['Baskı / acele ettirme']);
assert.deepEqual(cats('Bu işle işini bırakabilirsin'), ['Kazanç vaadi']);
console.log('ek testler geçti');
