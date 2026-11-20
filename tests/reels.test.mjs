import assert from 'node:assert/strict';
import { TEMPLATES, SCENE_COUNT, REEL_TOTAL, defaultStoryboard, normalizeStoryboard, normalizeHandle, normalizeKeyword,
  reelFindings, aiStoryboardPrompt, parseAiStoryboard, suggestCaption, pickMimeType, reelSupport, wrapWords,
  previewTime, reelFileName } from '../js/pazarlama/reels.js';

// Varsayılan senaryo: 4 sahne, şema sürümü, uyumlu
const sb = defaultStoryboard({ handle: 'h.gedikli.official', kw: 'girişim' });
assert.equal(sb.v, 1); assert.equal(sb.scenes.length, SCENE_COUNT);
assert.equal(sb.handle, '@h.gedikli.official');
assert.equal(sb.kw, 'GİRİŞİM', 'Türkçe büyük harf (i → İ)');
assert.deepEqual(reelFindings(sb), [], 'varsayılan şablon uyum kontrolünden geçmeli');
for (const t of Object.values(TEMPLATES)) assert.equal(t.scenes.length, SCENE_COUNT);
assert.equal(REEL_TOTAL, 22.5);

// Bozuk/eksik veri güvenle düzelir; 2 satır sınırı; uzunluk sınırları
const n = normalizeStoryboard({ template: 'yok', scenes: [{ top: 'a\nb\nc', bot: 'x'.repeat(500) }], slogan: null, cta: 'Bir\niki', kw: '', handle: '  @@deneme hesap ' });
assert.equal(n.template, 'mesai');
assert.equal(n.scenes[0].top, 'a\nb');
assert.ok(n.scenes[0].bot.length <= 70);
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
console.log('reels testleri geçti');
