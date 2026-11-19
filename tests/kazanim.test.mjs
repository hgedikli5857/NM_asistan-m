import assert from 'node:assert/strict';
import * as m from '../js/kazanim/model.js';
const now = new Date('2026-11-19T15:00:00');
assert.equal(m.waNumber('0532 123 45 67'), '905321234567');
assert.equal(m.waNumber('5321234567'), '905321234567');
assert.equal(m.waNumber('+90 532 123 45 67'), '905321234567');
assert.equal(m.waNumber('123'), null);
assert.equal(m.relativeDay('2026-11-19T09:00:00', now), 'bugün');
assert.equal(m.relativeDay('2026-11-17T09:00:00', now), '2 gün önce');
assert.equal(m.parseTrDate('5.3.2026').getMonth(), 2);
const ps = [
  { id:1, stage:'temas', temperature:'sicak', last_contact_at:'2026-11-10T10:00:00', created_at:'2026-11-01' },
  { id:2, stage:'temas', temperature:'sicak', last_contact_at:'2026-11-18T10:00:00', created_at:'2026-11-01' },
  { id:3, stage:'davet', temperature:'ilik', next_follow_up_at:'2026-11-19T10:00:00' },
  { id:4, stage:'davet', temperature:'sicak', next_follow_up_at:'2026-11-25T10:00:00', last_contact_at:'2026-11-01' },
  { id:5, stage:'pasif', temperature:'sicak', next_follow_up_at:'2026-11-18T10:00:00' },
];
assert.deepEqual(m.dueFollowUps(ps, now).map(p=>p.id), [3]);
assert.deepEqual(m.quietHotProspects(ps, now).map(p=>p.id), [1]);
assert.equal(m.filterProspects([{full_name:'Ayşe İnce'}], {q:'ince'}).length, 1);
const store = { getItem: () => JSON.stringify([{ id: 17, isim: 'Ali', tel: '0532', asama: 4, liste: 'sicak', saglik: 'şeker', gelir: 'yüksek', tarih: '1.9.2026', wa: '0533' }, { isim: '' }]) };
const legacy = m.readLegacy(store);
assert.equal(legacy.length, 1);
const row = m.mapLegacy(legacy[0], 'org');
assert.equal(row.stage, 'is_ortagi'); assert.equal(row.temperature, 'sicak'); assert.equal(row.phone, '0532');
assert.equal(row.extra.whatsapp, '0533'); assert.ok(!JSON.stringify(row).includes('şeker')); assert.ok(!JSON.stringify(row).includes('yüksek'));
console.log('model testleri geçti');
