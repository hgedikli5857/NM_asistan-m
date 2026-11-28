import assert from 'node:assert/strict';
import { normalizeStoryboard, storyboardToText, textToStoryboard } from '../js/pazarlama/reels.js';
const sb = normalizeStoryboard({ v: 2, mode: 'ai', scenes: [
  { top: 'Sabah 6:30\nAlarm çalıyor', bot: 'Önce telefona\ndokunmuyorum\nSu içip pencereyi açıyorum', sec: 4 },
  { top: 'Kısa bir plan', bot: 'Bugün için üç öncelik', sec: 5.5 },
  { top: '', bot: 'Sadece alt yazı', sec: 3 }], slogan: 'Küçük adımlar\nbüyük fark', cta: 'Merak ediyorsan yorumlara yaz:', kw: 'BİLGİ' });
const txt = storyboardToText(sb);
const back = textToStoryboard(txt, sb);
assert.deepEqual(back.sb.scenes, sb.scenes);
assert.equal(back.sb.slogan, sb.slogan); assert.equal(back.sb.cta, sb.cta); assert.equal(back.sb.kw, 'BİLGİ');
assert.equal(back.warnings.length, 0);
// Düzenleme: sahne ekle, süre başlıktan, ayırıcısız sahne
const edited = txt.replace('Bugün için üç öncelik', 'Bugün için en fazla üç öncelik') + '\n\nSahne 4 · 6 sn\nYeni başlık\nYeni alt yazı';
const e = textToStoryboard(edited, sb);
assert.equal(e.sb.scenes.length, 4);
assert.equal(e.sb.scenes[1].bot, 'Bugün için en fazla üç öncelik');
assert.deepEqual(e.sb.scenes[3], { top: 'Yeni başlık', bot: 'Yeni alt yazı', sec: 6 });
assert.throws(() => textToStoryboard('Sahne 1\nTek', sb));
console.log('fulledit ok'); console.log(txt);
