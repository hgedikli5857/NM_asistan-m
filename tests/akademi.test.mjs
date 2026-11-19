import assert from 'node:assert/strict';
import { LESSONS, FIRST_14, MODULES } from '../js/akademi/content.js';
import { earnedBadges, programDay } from '../js/akademi/badges.js';
const ids = [...LESSONS.map(l => l.id), ...FIRST_14.map(t => t.id)];
assert.equal(new Set(ids).size, ids.length, 'kimlikler benzersiz olmalı');
for (const l of LESSONS) {
  assert.ok(MODULES.some(m => m.id === l.module), l.id);
  assert.ok(l.quiz.length >= 2, l.id);
  for (const q of l.quiz) assert.ok(q.a >= 0 && q.a < q.o.length, l.id + ' cevap sırası');
}
assert.equal(LESSONS.length, 15); assert.equal(FIRST_14.length, 14);
const b = earnedBadges({ prospects: 25, contacts: 3, presentations: 0, invites: 0, wins: 0, reviews: 0, streak: 0, lessons: 0, tasks: 0, totalLessons: 15, totalTasks: 14, temelDone: false });
assert.deepEqual(b.filter(x => x.earned).map(x => x.id), ['ilk_aday', 'liste_20']);
assert.equal(programDay(new Date('2026-11-01T10:00:00'), new Date('2026-11-19T09:00:00')), 19);
console.log('akademi testleri geçti');
