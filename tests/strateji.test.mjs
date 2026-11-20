// Mesaj Üretim Stratejisi kabul kriterleri
import assert from 'node:assert/strict';
import { checkMessage, checkForScenario, autoFix } from '../js/iletisim/uyum.js';
import * as st from '../js/iletisim/strateji.js';
const cats = t => checkMessage(t).map(f => f.cat);

// 1) Marka filtresi: yasak ifade kalmaz
assert.ok(cats('Network marketing ile ilgili konuşalım').includes('Yasak terim'));
assert.ok(cats('Bu bir MLM değil').includes('Yasak terim'));
assert.ok(cats('Çok katmanlı pazarlama').includes('Yasak terim'));
assert.ok(cats('Ek gelir elde edebilirsiniz').includes('Gelir ifadesi'));
assert.ok(cats('Kazanç planını anlatayım').includes('Gelir ifadesi'));
assert.ok(cats('Prim sistemi çok iyi').includes('Gelir ifadesi'));
assert.ok(cats('Bu bantlar harika').includes('Ürün adı'));
assert.ok(cats('Garanti veriyorum').includes('Abartı / garanti'));
assert.ok(cats('Fırsat kaçıyor, haberin olsun').includes('Abartı / garanti'));
assert.ok(cats('Hastalığınıza iyi gelir').includes('Sağlık iddiası'));
// "gelir misin" (gelmek fiili) yanlış alarm vermez
assert.deepEqual(cats('Cumartesi çaya gelir misiniz? Uygun değilse hiç sorun değil.'), []);
assert.deepEqual(cats('Yarın gelirsen sevinirim.'), []);
// Otomatik düzeltme
assert.equal(autoFix('Network marketing işi ve bant'), 'bireysel girişimcilik işi ve patch');
assert.deepEqual(cats(autoFix('MLM ile ilgili bantları anlatayım')), []);

// 2) Vazgeçen kişiye soru üretilmez
assert.ok(checkForScenario('Anlıyorum, teşekkürler. Tekrar düşünür müsünüz?', 'vazgecti').some(f => f.cat === 'Vazgeçen kişiye soru'));
assert.deepEqual(checkForScenario('Anlıyorum, teşekkür ederim. Kapım her zaman açık.', 'vazgecti'), []);
assert.deepEqual(checkForScenario('Uygun bir gün var mı?', 'takip'), []);

// 3) Çalışma dışı gruplar
assert.equal(st.isExcluded({ full_name: '!Ali Veli', tags: [] }), true);
assert.equal(st.isExcluded({ full_name: 'Ali', tags: ['!'] }), true);
assert.equal(st.isExcluded({ full_name: 'Ali', tags: ['aile'] }), false);

// 4) 24 saat penceresi
const now = Date.parse('2026-11-20T12:00:00Z');
assert.equal(st.windowState({}).known, false);
const open = st.windowState({ extra: { crm: { conv: { last_in_at: '2026-11-20T02:00:00Z' } } } }, now);
assert.equal(open.open, true); assert.equal(open.hoursLeft, 14);
assert.equal(st.windowState({ extra: { crm: { conv: { last_in_at: '2026-11-18T12:00:00Z' } } } }, now).open, false);
assert.equal(st.windowState({ extra: { crm: { conv: {} } } }, now).open, false);

// 5) Soğuk kişi ve son 4 hane
assert.equal(st.isCold({ last_contact_at: null, extra: {} }), true);
assert.equal(st.isCold({ last_contact_at: '2026-11-01' }), false);
assert.equal(st.isCold({ extra: { crm: { conv: { id: 1 } } } }), false);
assert.equal(st.last4('+90 535 416 17 33'), '1733');

// 6) Sınırlar: 10 dakikada 1, günde 30
assert.equal(st.checkLimits([], 'p1', now).ok, true);
assert.equal(st.checkLimits([{ at: now - 5 * 60e3, pid: 'p1' }], 'p1', now).ok, false);
assert.equal(st.checkLimits([{ at: now - 5 * 60e3, pid: 'p1' }], 'p2', now).ok, true);
assert.equal(st.checkLimits([{ at: now - 11 * 60e3, pid: 'p1' }], 'p1', now).ok, true);
const thirty = Array.from({ length: 30 }, (_, i) => ({ at: now - i * 1000, pid: 'x' + i }));
assert.equal(st.checkLimits(thirty, 'yeni', now).ok, false);

// 7) İstem: hitap, kimlik, senaryo, marka kuralları
const pr = st.buildReplyPrompt({ scenario: 'maddi', input: 'param yok dedi', hitap: 'siz', sender: 'asistan', ownerName: 'Hakan' });
assert.ok(pr.includes('"siz"') && pr.includes("Hakan Bey'in dijital asistanı") && pr.includes('Satış yapma'));
assert.ok(pr.includes('bireysel girişimcilik') && pr.includes('patch'));
assert.ok(pr.includes('secenekler tam 1 adet'));
assert.ok(st.buildReplyPrompt({ scenario: 'auto', input: 'x', hitap: 'sen', sender: 'kisisel' }).includes('"sen"'));
assert.ok(st.buildReplyPrompt({ scenario: 'vazgecti', input: 'x' }).includes('SORU SORMA'));
assert.equal(st.defaultHitap({}), 'siz');
console.log('strateji testleri geçti');
