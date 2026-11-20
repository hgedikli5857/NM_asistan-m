import assert from 'node:assert/strict';
import fs from 'node:fs';
// client.js supabase'i (esm.sh) içe aktarır; testte geçici klasöre saf kopya yaz
import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmtest-'));
fs.writeFileSync(path.join(dir, 'client.js'), fs.readFileSync(new URL('../js/ai/client.js', import.meta.url), 'utf8').replace(/^import .*$/m, 'const supabase = null;'));
fs.copyFileSync(new URL('../js/ai/coach.js', import.meta.url), path.join(dir, 'coach.js'));
const c = await import(path.join(dir, 'coach.js'));
const now = new Date('2026-11-19T12:00:00');
const ps = [
  { id: 'a', stage: 'liste', temperature: 'ilik', tags: [] },
  { id: 'b', stage: 'temas', temperature: 'sicak', last_contact_at: '2026-11-01', tags: ['!'] },
  { id: 'c', stage: 'temas', temperature: 'sicak', last_contact_at: '2026-11-18', tags: [] },
  { id: 'd', stage: 'musteri', temperature: 'sicak', tags: ['!'] }
];
assert.deepEqual(c.pickBatch(ps, 'untouched', new Set(), 10, now).map(p => p.id), ['a']);
// "!" işaretli kişiler (b) çalışma dışı: hiçbir listeye girmez
assert.deepEqual(c.pickBatch(ps, 'quiet', new Set(), 10, now).map(p => p.id), []);
assert.equal(c.LIST_FILTERS.flagged, undefined);
assert.deepEqual(c.pickBatch(ps, 'all', new Set(['a']), 10, now).map(p => p.id), ['c']);
assert.deepEqual(c.pickBatch([{ id: 'x', full_name: '!Ali', stage: 'liste' }], 'all', new Set(), 10, now), []);
const n = c.normalizeSuggestions([{ i: 0, oncelik: 5, sicaklik: 'x', mesaj: 'm' }, { i: 9 }, { i: '1', oncelik: 1, sicaklik: 'sicak' }], 2);
assert.deepEqual(n.map(x => [x.i, x.oncelik, x.sicaklik]), [[0, 2, null], [1, 1, 'sicak']]);
const msgs = c.coachMessages('BAĞLAM', [{ role: 'user', content: 'soru' }, { role: 'assistant', content: 'cevap' }]);
assert.ok(msgs[0].content.startsWith('BAĞLAM') && msgs[1].role === 'assistant');
assert.ok(c.listPrompt([{ id: 'a' }], ['Ad: Ali'], { a: 'kuzenim' }).includes('Kullanıcının notu: kuzenim'));
console.log('koç testleri geçti');
