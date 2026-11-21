import assert from 'node:assert/strict';
import { cardFromProspect, mergeLive, completeness, diffCard, display, kartHTML } from '../js/kisi/model.js';

const linked = { id: 'p1', full_name: 'Nazmiye', stage: 'temas', temperature: 'soguk', occupation: 'eski', tags: [],
  extra: { crm: { id: 'L1', protected: false, sehir: 'Adana', tags: ['Bot'], kart: { ad_soyad: 'Nazmiye', sehir: 'Adana', meslek: 'emlak danışmanı',
    medeni_durum: 'bilinmiyor', cocuk_sayisi: 'bilinmiyor', liste_turu: 'soguk', asama: 'ilk_temas', kanal: 'whatsapp', bot_doldurdu: ['asama', 'sehir', 'meslek'] } } } };
const st = cardFromProspect(linked);
assert.ok(st.linked);
assert.equal(st.card.meslek, 'emlak danışmanı', 'panel kartı öncelikli');
assert.ok(st.bot.has('sehir') && st.bot.has('stage'));
assert.equal(completeness(st.card), 38); // ad, şehir, meslek / 8
const live = mergeLive(st, { ad_soyad: 'Nazmiye K', yas: 41, sehir: 'Adana', meslek: 'emlak danışmanı', medeni_durum: 'evli', cocuk_sayisi: '2', bot_doldurdu: ['yas'], tags: ['Ankara'] }, 'temas');
assert.equal(live.card.yas, 41); assert.equal(display('medeni_durum', live.card.medeni_durum), 'Evli');
assert.ok(live.bot.has('yas') && !live.bot.has('sehir'));
assert.deepEqual(diffCard(live.card, { ...live.card, yas: '42', ozel_not: '' }), { yas: '42' });

const local = cardFromProspect({ id: 'p2', full_name: 'Veli', stage: 'liste', temperature: 'ilik', occupation: 'Asker', interests: null, extra: { kart: { yas: 23 } }, tags: ['Google formu'] });
assert.ok(!local.linked); assert.equal(local.card.yas, 23); assert.equal(local.card.meslek, 'Asker');
const html = kartHTML(live);
assert.ok(html.includes('Bot panel ile senkron') && html.includes('bot-tag') && !html.includes('saglik') && !html.includes('gelir'));
console.log('kart: tamam');
