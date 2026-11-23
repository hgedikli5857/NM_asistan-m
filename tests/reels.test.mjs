import assert from 'node:assert/strict';
import { TEMPLATES, SCENE_COUNT, REEL_TOTAL, defaultStoryboard, normalizeStoryboard, normalizeHandle, normalizeKeyword,
  reelFindings, aiStoryboardPrompt, parseAiStoryboard, suggestCaption, pickMimeType, reelSupport, wrapWords,
  previewTime, reelFileName } from '../js/pazarlama/reels.js';

// Varsayılan senaryo: 4 sahne, şema sürümü, uyumlu
const sb = defaultStoryboard({ handle: 'h.gedikli.official', kw: 'girişim' });
assert.equal(sb.v, 2); assert.equal(sb.scenes.length, SCENE_COUNT);
assert.equal(sb.handle, '@h.gedikli.official');
assert.equal(sb.kw, 'GİRİŞİM', 'Türkçe büyük harf (i → İ)');
assert.deepEqual(reelFindings(sb), [], 'varsayılan şablon uyum kontrolünden geçmeli');
for (const t of Object.values(TEMPLATES)) assert.equal(t.scenes.length, SCENE_COUNT);
assert.equal(REEL_TOTAL, 22.5);

// Bozuk/eksik veri güvenle düzelir; 2 satır sınırı; uzunluk sınırları
const n = normalizeStoryboard({ template: 'yok', scenes: [{ top: 'a\nb\nc', bot: 'x'.repeat(500) }], slogan: null, cta: 'Bir\niki', kw: '', handle: '  @@deneme hesap ' });
assert.equal(n.template, 'mesai');
assert.equal(n.scenes[0].top, 'a\nb');
assert.ok(n.scenes[0].bot.length <= 140);
assert.equal(n.scenes[1].top, TEMPLATES.mesai.scenes[1].top, 'eksik sahne şablondan dolar');
assert.equal(n.cta, 'Bir iki');
assert.equal(n.kw, 'GİRİŞİM');
assert.equal(n.handle, '@denemehesap');
assert.equal(normalizeHandle(''), '');
assert.equal(normalizeKeyword('ilk adım'), 'İLK ADIM');
assert.ok(JSON.stringify(n).length < 20000, 'veritabanı sınırı (20 KB) altında');

// Uyum: gelir, sağlık, yasak terim ve emoji yakalanır
const bad = normalizeStoryboard({ scenes: [{ top: 'Ek gelir\nkazanıyorum', bot: 'Network marketing ile' }, { top: 'Kilo verdim', bot: 'tedavi oldum' }], slogan: 'Harika 🚀' });
const cats = reelFindings(bad).map(f => f.cat);
for (const c of ['Gelir ifadesi', 'Yasak terim', 'Sağlık iddiası', 'Emoji']) assert.ok(cats.includes(c), c + ' yakalanmalı: ' + cats);

// AI senaryosu: istem kuralları içerir; yanıt normalize edilir; eksik yanıt hata verir
const prompt = aiStoryboardPrompt('İşimin yanında akşamlarım', sb);
assert.ok(prompt.includes('"siz"') && prompt.includes('GİRİŞİM') && prompt.includes('Emoji yok'));
const ai = parseAiStoryboard({ scenes: [1, 2, 3, 4].map(i => ({ top: `Başlık ${i}\nikinci`, bot: `Alt ${i}\nsatır` })), slogan: 'S1\nS2', cta: 'Merak ediyorsanız yorumlara yazın:' }, sb);
assert.equal(ai.scenes[3].top, 'Başlık 4\nikinci'); assert.equal(ai.handle, '@h.gedikli.official'); assert.equal(ai.kw, 'GİRİŞİM');
assert.throws(() => parseAiStoryboard({ scenes: [{ top: 'x' }] }, sb));

// Caption önerisi anahtar kelimeyi içerir ve uyumlu
const cap = suggestCaption(sb, 'Mesai bitince');
assert.ok(cap.includes('GİRİŞİM') && cap.startsWith('Mesai bitince'));
assert.deepEqual(reelFindings({ ...sb, scenes: sb.scenes, slogan: cap, cta: '', kw: '' }).filter(f => f.level === 'yuksek'), []);

// Kayıt biçimi: MP4 öncelikli, yoksa WebM, hiç yoksa null
assert.equal(pickMimeType({ isTypeSupported: t => t.startsWith('video/') }), 'video/mp4;codecs=avc1.42E01E');
assert.equal(pickMimeType({ isTypeSupported: t => t.includes('webm') }), 'video/webm;codecs=vp9');
assert.equal(pickMimeType(undefined), null);
assert.deepEqual(reelSupport({}), { ok: false, mp4: false, type: null });
const fakeWin = { MediaRecorder: { isTypeSupported: () => true }, HTMLCanvasElement: function () {} };
fakeWin.HTMLCanvasElement.prototype.captureStream = () => {};
assert.equal(reelSupport(fakeWin).mp4, true);

// Yardımcılar
assert.deepEqual(wrapWords(s => s.length * 10, 'bir iki üç dört', 75), ['bir iki', 'üç dört']);
assert.ok(previewTime(0) > 0 && previewTime(SCENE_COUNT + 1) < REEL_TOTAL);
assert.equal(reelFileName('Mesai bitince: İşim & ben', 'mp4'), 'reels-mesai-bitince-isim-ben.mp4');
assert.equal(reelFileName('', 'webm'), 'reels-video.webm');

// Şema 2: esnek sahne sayısı/süresi, kendi metin modu
import('../js/pazarlama/reels.js').then(m => {
  const { parseScript, timeline, reelTotal, blankStoryboard, fidelity, aiScriptPrompt, parseAiScript, MAX_SCENES } = m;
  // Eski kayıt (şema 1) 4 sahne olarak açılır
  const old = normalizeStoryboard({ v: 1, scenes: [{ top: 'a', bot: 'b' }, { top: 'c', bot: 'd' }, { top: 'e', bot: 'f' }, { top: 'g', bot: 'h' }] });
  assert.equal(old.scenes.length, 4); assert.equal(reelTotal(old), 22.5);
  const src = 'Sabah 6da kalkıyorum.\n\nÇünkü akşam işim başlıyor ve ekibimle görüşüyorum. Haftalık planımı yapıyorum.\n\nKüçük adımlar\nBüyük farklar yaratır.\n\nSlogan: Her gün bir adım\nCTA: Merak ediyorsan yorumlara yaz:';
  const p = parseScript(src);
  assert.equal(p.scenes.length, 3); assert.equal(p.slogan, 'Her gün bir adım'); assert.equal(p.cta, 'Merak ediyorsan yorumlara yaz:');
  assert.equal(p.scenes[2].top, 'Küçük adımlar'); assert.equal(p.scenes[2].bot, 'Büyük farklar yaratır.');
  assert.ok(p.scenes[1].bot.startsWith('Çünkü') && !p.scenes[1].top, 'uzun tek satır alt yazıya gider');
  assert.ok(p.scenes.every(x => x.sec >= 3), 'okunabilir süre');
  const own = normalizeStoryboard({ v: 2, mode: 'metin', src, scenes: p.scenes, slogan: p.slogan, cta: p.cta });
  assert.equal(own.scenes.length, 3); assert.equal(own.mode, 'metin');
  const tl = timeline(own);
  assert.equal(tl.starts[1], own.scenes[0].sec); assert.equal(tl.total, tl.clipEnd + 3 + 3.5);
  assert.equal(fidelity(src, own), 1, 'kurallı bölme kelime değiştirmez');
  // Slogansız: slogan süresi düşer
  const noSlogan = normalizeStoryboard({ ...own, slogan: '' });
  assert.equal(reelTotal(noSlogan), timeline(noSlogan).clipEnd + 3.5);
  // "Sahne N:" başlıkları ve --- ayıracı
  const p2 = parseScript('Sahne 1: Merhaba\nSahne 2: İkinci\n---\nÜçüncü');
  assert.deepEqual(p2.scenes.map(x => x.top), ['Merhaba', 'İkinci', 'Üçüncü']);
  // Çok parça → en fazla 8 sahne, kelime kaybı yok
  const many = parseScript(Array.from({ length: 20 }, (_, i) => `Satır ${i + 1}`).join('\n'));
  assert.ok(many.scenes.length <= MAX_SCENES && many.warnings.length === 1);
  assert.ok(many.scenes.map(x => x.top + ' ' + x.bot).join(' ').includes('Satır 20'));
  // Tek cümle → en az 2 sahne
  assert.equal(parseScript('Tek bir cümle.').scenes.length, 2);
  // Boş başlangıç
  const b = blankStoryboard({ kw: 'bilgi' }); assert.equal(b.scenes.length, 3); assert.equal(b.slogan, ''); assert.equal(b.kw, 'BİLGİ');
  // AI düzenleme istemi metni içerir; sadakat ölçülür
  assert.ok(aiScriptPrompt('Benim metnim burada').includes('Benim metnim burada') && aiScriptPrompt('x').includes('METNE SADIK'));
  const ai2 = parseAiScript({ scenes: [{ top: 'Sabah', bot: '6da kalkıyorum.' }, { top: 'Uydurma', bot: 'eklenen kelimeler var' }] }, own, src);
  assert.ok(fidelity(src, ai2) < 0.8, 'uydurma kelime düşük sadakat verir');
  assert.throws(() => parseAiScript({ scenes: [{ top: 'x' }] }, own, src));
  console.log('reels testleri geçti');
});
