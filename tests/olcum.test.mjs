import assert from 'node:assert/strict';
import * as m from '../js/olcum/metrics.js';
const now = new Date('2026-11-19T15:00:00'); // Perşembe
assert.equal(m.dayKey(m.weekStart(now)), '2026-11-16');
assert.deepEqual(m.lastDays(3, now), ['2026-11-17', '2026-11-18', '2026-11-19']);
const interactions = [
  { prospect_id: 'a', kind: 'mesaj', occurred_at: '2026-11-18T10:00:00' }, // a: yeni temas (18)
  { prospect_id: 'a', kind: 'arama', occurred_at: '2026-11-19T10:00:00' }, // a: takip (19)
  { prospect_id: 'b', kind: 'mesaj', occurred_at: '2026-11-19T11:00:00' }, // b: yeni temas (19)
  { prospect_id: 'b', kind: 'not', occurred_at: '2026-11-19T11:30:00' },   // not sayılmaz
  { prospect_id: 'a', kind: 'sunum', occurred_at: '2026-11-19T20:00:00' }, // a: sunum (19)
];
const stageEvents = [
  { prospect_id: 'a', from_stage: null, to_stage: 'liste', occurred_at: '2026-11-17T09:00:00' },
  { prospect_id: 'a', from_stage: 'temas', to_stage: 'davet', occurred_at: '2026-11-19T12:00:00' },
  { prospect_id: 'a', from_stage: 'davet', to_stage: 'sunum', occurred_at: '2026-11-19T20:05:00' }, // aynı gün aynı aday: tekrar sayılmaz
  { prospect_id: 'b', from_stage: 'sunum', to_stage: 'musteri', occurred_at: '2026-11-19T21:00:00' },
  { prospect_id: 'b', from_stage: 'musteri', to_stage: 'is_ortagi', occurred_at: '2026-11-19T21:30:00' }, // zaten kazanılmıştı
];
const prospects = [{ created_at: '2026-11-17T09:00:00' }, { created_at: '2026-11-19T09:00:00' }];
const days = m.dailyMetrics({ interactions, stageEvents, prospects });
assert.deepEqual(days['2026-11-19'], { yeniTemas: 1, takip: 1, davet: 1, sunum: 1, yeniAday: 1, kazanilan: 1 });
assert.deepEqual(days['2026-11-18'], { yeniTemas: 1, takip: 0, davet: 0, sunum: 0, yeniAday: 0, kazanilan: 0 });
const week = m.sumRange(days, m.keysBetween(m.weekStart(now), now));
assert.equal(week.yeniTemas, 2); assert.equal(week.yeniAday, 2);
assert.equal(m.activeStreak(days, now), 2);
assert.equal(m.pct(3, 5), 60); assert.equal(m.pct(9, 5), 100); assert.equal(m.pct(0, 0), 0);
assert.ok(m.formatTL(50000).includes('50.000'));
console.log('ölçüm testleri geçti');
