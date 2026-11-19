import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { extractJSON, prospectBrief, firstName } = await import('../js/ai/client.js').catch(async e => {
  // supabase.js esm.sh'den yüklenemez; saf fonksiyonları ayrı test etmek için kopya yükle
  const src = (await import('node:fs')).readFileSync(new URL('../js/ai/client.js', import.meta.url), 'utf8')
    .replace(/^import .*$/m, 'const supabase = null;');
  return import('data:text/javascript,' + encodeURIComponent(src));
});
assert.deepEqual(extractJSON('Tabii! ```json\n{"a": [1, {"b": "x}"}]}\n``` iyi şanslar'), { a: [1, { b: 'x}' }] });
assert.deepEqual(extractJSON('[{"i":0}] son'), [{ i: 0 }]);
assert.throws(() => extractJSON('json yok'));
assert.equal(firstName('! Erhan Şeker'), 'Erhan');
const b = prospectBrief({ full_name: '!Ayşe Demir', stage: 'temas', temperature: 'sicak', tags: ['!'], phone: '0532', notes: 'x'.repeat(500), last_contact_at: '2026-11-10' }, new Date('2026-11-19'));
assert.ok(b.includes('Ad: Ayşe') && b.includes('9 gün') && !b.includes('0532') && b.length < 450, b);
console.log('ai istemci testleri geçti');
