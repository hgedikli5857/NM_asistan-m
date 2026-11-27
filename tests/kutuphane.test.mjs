import assert from 'node:assert/strict';
import { embedUrl, kindFromFile, requiredPath, filterItems, normalizeQuiz, scoreQuiz, parseQuizText, quizToText, renderText, progressId, CATEGORIES } from '../js/akademi/library.js';

assert.equal(embedUrl('https://youtu.be/abc123XYZ'), 'https://www.youtube-nocookie.com/embed/abc123XYZ');
assert.equal(embedUrl('https://www.youtube.com/watch?v=abc123XYZ&t=4'), 'https://www.youtube-nocookie.com/embed/abc123XYZ');
assert.equal(embedUrl('https://youtube.com/shorts/abc123XYZ'), 'https://www.youtube-nocookie.com/embed/abc123XYZ');
assert.equal(embedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456');
assert.equal(embedUrl('https://drive.google.com/file/d/1AbC/view?usp=sharing'), 'https://drive.google.com/file/d/1AbC/preview');
assert.equal(embedUrl('https://onemore.com.tr/urunler'), null);
assert.equal(embedUrl('değil'), null);
assert.equal(kindFromFile({ type: 'application/pdf', name: 'a.pdf' }), 'pdf');
assert.equal(kindFromFile({ type: '', name: 'Sunum.HTML' }), 'html');
assert.equal(kindFromFile({ type: 'video/quicktime', name: 'a.mov' }), 'video');
assert.equal(kindFromFile({ type: 'application/zip', name: 'a.zip' }), null);
assert.ok(CATEGORIES.some(c => c.id === 'kazanc') && CATEGORIES.some(c => c.id === 'urunler') && CATEGORIES.some(c => c.id === 'sirket'));

const items = [
  { id: '1', title: 'Şirket tanıtımı', category: 'sirket', level: 'baslangic', sort: 2, required: true, published: true, summary: '' },
  { id: '2', title: 'Kazanç planı', category: 'kazanc', level: 'orta', sort: 1, required: true, published: true, summary: 'Kariyer basamakları' },
  { id: '3', title: 'Patch kullanımı', category: 'urunler', level: 'baslangic', sort: 1, required: false, published: true, summary: 'Ürün videosu' },
  { id: '4', title: 'Taslak', category: 'diger', level: 'baslangic', sort: 1, required: true, published: false, summary: '' }
];
const p = requiredPath(items, new Set([progressId('1')]));
assert.equal(p.total, 2, 'taslak zorunlu sayılmaz'); assert.equal(p.done, 1); assert.equal(p.next.id, '2'); assert.equal(p.pct, 50);
assert.deepEqual(filterItems(items, { q: 'kariyer' }).map(x => x.id), ['2']);
assert.deepEqual(filterItems(items, { category: 'urunler' }).map(x => x.id), ['3']);
assert.equal(filterItems(items.filter(x => x.published), {})[0].id, '1', 'zorunlu + başlangıç önce');

const q = parseQuizText('1. Kazanç planı ne garanti eder?\n- Sabit gelir\n* Hiçbir geliri garanti etmez\n- Prim\n\nÜrün ilaç mıdır?\n* Hayır\n- Evet');
assert.equal(q.length, 2); assert.equal(q[0].a, 1); assert.equal(q[0].q, 'Kazanç planı ne garanti eder?');
assert.equal(parseQuizText(quizToText(q))[1].o[0], 'Hayır');
assert.equal(parseQuizText('Soru?\n- a\n- b'), null, 'doğru cevapsız soru geçersiz');
assert.deepEqual(scoreQuiz(q, [1, 0]), { right: 2, total: 2, score: 100 });
assert.equal(normalizeQuiz([{ q: 'x', o: ['a'], a: 0 }]), null);
const esc = s => String(s).replace(/</g, '&lt;');
assert.equal(renderText('## Başlık\n\n- bir\n- iki\n\nParagraf <b>', esc), '<h3>Başlık</h3><ul><li>bir</li><li>iki</li></ul><p>Paragraf &lt;b></p>');
console.log('kütüphane: tamam');
