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

// Klasör ağacı, Drive, ses ve belge
import('../js/akademi/library.js').then(m => {
  const F = [{ id: 'a', parent_id: null, name: 'Ürünler', sort: 1, category: 'urunler' }, { id: 'b', parent_id: 'a', name: 'Patch', sort: 1, category: 'urunler' },
    { id: 'c', parent_id: 'b', name: 'Kullanım', sort: 1, category: 'urunler' }, { id: 'd', parent_id: null, name: 'Şirket', sort: 2, category: 'sirket' }];
  assert.deepEqual(m.childrenOf(F).map(f => f.id), ['a', 'd']);
  assert.deepEqual(m.folderPath(F, 'c').map(f => f.name), ['Ürünler', 'Patch', 'Kullanım']);
  assert.deepEqual([...m.descendantIds(F, 'a')].sort(), ['a', 'b', 'c']);
  assert.deepEqual(m.flatTree(F).map(f => `${f.depth}${f.id}`), ['0a', '1b', '2c', '0d']);
  assert.equal(m.rootCategory(F, 'c'), 'urunler');
  const items = [{ id: '1', folder_id: 'c' }, { id: '2', folder_id: 'a' }, { id: '3', folder_id: 'd' }];
  assert.deepEqual(m.folderStats(F, items, 'a', new Set(['lib:1'])), { items: 2, done: 1, sub: 1 });
  assert.equal(m.driveInfo('https://drive.google.com/file/d/XyZ/view?usp=sharing').embed, 'https://drive.google.com/file/d/XyZ/preview');
  assert.equal(m.driveInfo('https://drive.google.com/open?id=XyZ').type, 'file');
  assert.equal(m.driveInfo('https://drive.google.com/drive/folders/F1?usp=sharing').type, 'folder');
  assert.equal(m.driveInfo('https://docs.google.com/document/d/D1/edit').embed, 'https://docs.google.com/document/d/D1/preview');
  assert.equal(m.driveInfo('https://docs.google.com/spreadsheets/d/S1/edit#gid=0').type, 'sheet');
  assert.equal(m.driveInfo('https://youtube.com/x'), null);
  assert.equal(m.kindFromFile({ type: 'audio/mpeg', name: 'a.mp3' }), 'ses');
  assert.equal(m.kindFromFile({ type: '', name: 'Plan.PPTX' }), 'belge');
  assert.equal(m.mimeOf('rapor.HTML'), 'text/html');
  assert.equal(m.mimeOf('a.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(m.mimeOf('a.bilinmez', 'x/y'), 'x/y');
  const doc = m.textDocHtml('Başlık <x>', '- bir', s => String(s).replace(/</g, '&lt;'));
  assert.ok(doc.startsWith('<!DOCTYPE html>') && doc.includes('<h1>Başlık &lt;x></h1>') && doc.includes('<li>bir</li>'));
  assert.equal(m.DEFAULT_FOLDERS.length, 7);
  console.log('klasör/drive/ses: tamam');
});
