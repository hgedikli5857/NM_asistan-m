// Reels Stüdyosu motoru: senaryo (storyboard) modeli + tarayıcıda video üretimi (Canvas + MediaRecorder).
// Sunucu yok; video kullanıcının telefonunda üretilir ve orada kalır. Saf fonksiyonlar Node testlerinde de çalışır.
import { checkMessage } from '../iletisim/uyum.js';

export const REEL_SCHEMA = 1;
export const SCENE_COUNT = 4;
export const SCENE_LEN = 4.0;   // her sahne (sn)
export const XF = 0.3;          // sahne geçişi (sn)
export const SLOGAN_LEN = 3.0;
export const CTA_LEN = 3.5;
export const REEL_TOTAL = SCENE_COUNT * SCENE_LEN + SLOGAN_LEN + CTA_LEN; // 22,5 sn

export const TEMPLATES = {
  mesai: {
    label: 'Mesai bitince',
    hint: 'İşinizin yanında yaptığınız girişimi anlatan, 4 sahneli tam ekran video.',
    scenes: [
      { top: 'Mesaim\nbitiyor.', bot: 'Asıl işimin yanında\nbireysel girişimcilik' },
      { top: 'Bir çay\nkoyuyorum.', bot: 'Akşam mesaim\nbaşlıyor' },
      { top: 'Haftamı\nplanlıyorum.', bot: 'Küçük hedefler,\nnet adımlar' },
      { top: 'Ekibimle\niletişimdeyim.', bot: 'İşimi\nbırakmadan' }
    ],
    slogan: 'Küçük ama istikrarlı\nadımlar.',
    cta: 'Nasıl yaptığımı merak ediyorsanız yorumlara yazın:'
  }
};

const clip = (v, n) => String(v ?? '').replace(/\r/g, '').slice(0, n);
// En fazla 2 satır: 1. satır beyaz, 2. satır altın
const twoLines = (v, n) => clip(v, n).split('\n').map(x => x.trim()).filter(Boolean).slice(0, 2).join('\n');

export function normalizeHandle(v) {
  const h = String(v || '').trim().replace(/\s+/g, '').replace(/^@*/, '');
  return h ? '@' + h.slice(0, 30) : '';
}
export function normalizeKeyword(v) {
  const k = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 16).toLocaleUpperCase('tr-TR');
  return k || 'GİRİŞİM';
}

export function defaultStoryboard(brand = {}, template = 'mesai') {
  const t = TEMPLATES[template] || TEMPLATES.mesai;
  return normalizeStoryboard({
    template, scenes: t.scenes, slogan: t.slogan, cta: t.cta,
    kw: brand.kw, handle: brand.handle
  });
}

// Veritabanından ya da AI'dan gelen her şeyi güvenli, sabit biçime çevir (şema sürümüyle)
export function normalizeStoryboard(raw = {}) {
  const t = TEMPLATES[raw.template] ? raw.template : 'mesai';
  const base = TEMPLATES[t];
  const scenes = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const s = (Array.isArray(raw.scenes) && raw.scenes[i]) || {};
    return { top: twoLines(s.top ?? base.scenes[i].top, 60), bot: twoLines(s.bot ?? base.scenes[i].bot, 70) };
  });
  return {
    v: REEL_SCHEMA, template: t, scenes,
    slogan: twoLines(raw.slogan ?? base.slogan, 60),
    cta: clip(raw.cta ?? base.cta, 90).replace(/\n+/g, ' ').trim(),
    kw: normalizeKeyword(raw.kw),
    handle: normalizeHandle(raw.handle)
  };
}

// Videoda görünen bütün metinler (uyum kontrolü için)
export function storyboardText(sb) {
  return [...sb.scenes.flatMap(s => [s.top, s.bot]), sb.slogan, sb.cta, sb.kw].join('\n');
}
const EMOJI = /\p{Extended_Pictographic}/u;
export function reelFindings(sb) {
  const f = checkMessage(storyboardText(sb));
  if (EMOJI.test(storyboardText(sb))) f.push({ cat: 'Emoji', level: 'orta', tip: 'Videoda emoji kullanma; sade ve okunur kalsın.', hits: ['emoji'] });
  return f;
}

// AI ile senaryo
export function aiStoryboardPrompt(topic, sb) {
  return `Instagram Reels için 4 sahnelik kısa video senaryosu yaz. Video yazı ağırlıklı; görüntü sahne başına stok klip ya da kişinin kendi çekimi.
Konu: ${topic}
Kişi: işinin yanında bireysel girişimcilik (doğrudan satış) yapan, sağlık ve kişisel gelişim alanında bir girişimci.
Ton: samimi ama profesyonel, gerçekçi, abartısız. İzleyiciye "siz" diye hitap et. Emoji yok.
Yasaklar: kazanç, gelir, para, prim rakamı; "işimi bıraktım" gibi gerçek dışı hikâye; sağlık iddiası (tedavi, iyileşme, zayıflama); "network marketing" ve "MLM" kelimeleri.
Her sahne: "top" = 2 satır başlık (1. satır en fazla 18 karakter, 2. satır en fazla 18 karakter), "bot" = 2 satır alt yazı (her satır en fazla 24 karakter). Satırları \\n ile ayır.
"slogan" 2 satır, "cta" tek cümle ve sonu "yorumlara yazın:" ile bitsin (anahtar kelime ayrıca gösterilecek: ${sb.kw}).
Sadece şu biçimde JSON döndür:
{"scenes":[{"top":"...","bot":"..."},{"top":"...","bot":"..."},{"top":"...","bot":"..."},{"top":"...","bot":"..."}],"slogan":"...","cta":"..."}`;
}
// j: AI yanıtından çıkarılmış JSON nesnesi (extractJSON ile)
export function parseAiStoryboard(j, current) {
  if (!j || !Array.isArray(j.scenes) || j.scenes.length < SCENE_COUNT) throw new Error('AI senaryosu eksik geldi, tekrar deneyin.');
  return normalizeStoryboard({ ...current, scenes: j.scenes, slogan: j.slogan, cta: j.cta });
}

// Paylaşım metni önerisi (caption)
export function suggestCaption(sb, topic = '') {
  const flat = s => s.replace(/\n/g, ' ');
  const lines = [flat(sb.scenes[0].top) + ' ' + flat(sb.scenes[0].bot) + '.',
    flat(sb.slogan), `${flat(sb.cta).replace(/:$/, '')} ${sb.kw}`];
  return (topic ? topic + '\n\n' : '') + lines.join('\n');
}

// MP4 öncelikli kayıt biçimi
export const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4',
  'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function pickMimeType(MR = globalThis.MediaRecorder) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  return MIME_TYPES.find(t => MR.isTypeSupported(t)) || null;
}
export function reelSupport(win = globalThis) {
  const MR = win.MediaRecorder;
  const canvasStream = !!(win.HTMLCanvasElement && win.HTMLCanvasElement.prototype.captureStream);
  const type = pickMimeType(MR);
  return { ok: !!MR && canvasStream && !!type, mp4: !!type && type.startsWith('video/mp4'), type };
}

// ====================================================================
// Çizim
const GOLD = '#c9a24a', NAVY = '#1b2a4a', DEEP = '#111c33';
export const REEL_FONT = 'Montserrat, "DM Sans", sans-serif';
const clamp01 = x => Math.min(Math.max(x, 0), 1);
export const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
export const backOut = x => { x = clamp01(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

function makeDots() {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: 34 }, () => ({ x: rnd(), y: rnd(), s: 3 + rnd() * 6, rise: 80 + rnd() * 160, a: 0.25 + rnd() * 0.5 }));
}
const DOTS = makeDots();
const DEMO_HUES = [28, 20, 140, 215];

function drawBg(c, W, H) {
  const g = c.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.75);
  g.addColorStop(0, '#24375f'); g.addColorStop(0.5, NAVY); g.addColorStop(1, DEEP);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawDots(c, W, H, t, k) {
  const p = t / REEL_TOTAL;
  c.fillStyle = GOLD; c.shadowColor = 'rgba(201,162,74,.6)'; c.shadowBlur = 10 * k;
  for (const d of DOTS) {
    c.globalAlpha = d.a * Math.min(1, p * 4);
    c.beginPath(); c.arc(d.x * W, d.y * H - d.rise * p * k, (d.s * k) / 2, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1; c.shadowBlur = 0;
}
function drawDemo(c, W, H, i, lt) {
  const h = DEMO_HUES[i % DEMO_HUES.length], sh = lt * 40;
  const g = c.createLinearGradient(0, -sh, W, H + sh);
  g.addColorStop(0, `hsl(${h},45%,22%)`); g.addColorStop(0.5, `hsl(${h},55%,38%)`); g.addColorStop(1, `hsl(${h + 20},40%,14%)`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawCover(c, v, W, H, zoom) {
  const vw = v.videoWidth || v.naturalWidth, vh = v.videoHeight || v.naturalHeight;
  if (!vw) return false;
  const sc = Math.max(W / vw, H / vh) * zoom, dw = vw * sc, dh = vh * sc;
  c.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return true;
}
function drawShade(c, W, H) {
  const g = c.createLinearGradient(0, 0, 0, H);
  [[0, 0.88], [0.26, 0.35], [0.4, 0], [0.58, 0], [0.72, 0.55], [0.88, 0.9], [1, 0.95]]
    .forEach(([p, a]) => g.addColorStop(p, `rgba(17,28,51,${a})`));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function textBlock(c, text, cx, y, size, weight, lh, alpha, dy, k) {
  if (alpha <= 0 || !text) return;
  const [l1, l2] = text.split('\n');
  c.globalAlpha = alpha; c.textAlign = 'center'; c.textBaseline = 'top';
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 22 * k;
  c.font = `${weight} ${size}px ${REEL_FONT}`;
  fitText(c, l1 || '', cx, y + dy, '#fff', size, weight, k);
  if (l2) fitText(c, l2, cx, y + dy + size * lh, GOLD, size, weight, k);
  c.shadowBlur = 0; c.globalAlpha = 1;
}
// Uzun satırı ekrana sığacak kadar küçült
function fitText(c, s, cx, y, color, size, weight, k) {
  const max = 980 * k;
  let w = c.measureText(s).width, sz = size;
  if (w > max) { sz = Math.max(size * 0.6, size * max / w); c.font = `${weight} ${sz}px ${REEL_FONT}`; }
  c.fillStyle = color; c.fillText(s, cx, y + (size - sz) / 2);
  if (sz !== size) c.font = `${weight} ${size}px ${REEL_FONT}`;
}
export function wrapWords(measure, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const t = line ? line + ' ' + w : w;
    if (measure(t) > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// Belirli bir andaki (t sn) kareyi çiz. media[i]: video/görsel öğesi ya da null (örnek arka plan)
export function drawReelFrame(c, W, H, t, media, sb) {
  const k = W / 1080;
  drawBg(c, W, H);
  const clipEnd = SCENE_COUNT * SCENE_LEN;
  if (t < clipEnd + XF) {
    for (let i = 0; i < SCENE_COUNT; i++) {
      const s0 = i * SCENE_LEN;
      if (t < s0 || t > s0 + SCENE_LEN + XF) continue;
      const lt = t - s0;
      let a = i === 0 ? easeOut(lt / 0.5) : Math.min(1, lt / XF);
      if (t > s0 + SCENE_LEN) a *= 1 - (t - s0 - SCENE_LEN) / XF;
      c.globalAlpha = Math.max(0, a);
      const m = media[i];
      if (!(m && drawCover(c, m, W, H, 1 + 0.06 * (lt / (SCENE_LEN + XF))))) drawDemo(c, W, H, i, lt);
      c.globalAlpha = 1;
    }
    const sa = t < 0.45 ? t / 0.4 : t > clipEnd - 0.05 ? Math.max(0, 1 - (t - clipEnd + 0.05) / 0.35) : 1;
    c.globalAlpha = clamp01(sa); drawShade(c, W, H);
    c.strokeStyle = 'rgba(201,162,74,.85)'; c.lineWidth = 20 * k; c.strokeRect(0, 0, W, H);
    c.globalAlpha = 1;
  }
  drawDots(c, W, H, t, k);
  for (let i = 0; i < SCENE_COUNT; i++) {
    const lt = t - i * SCENE_LEN;
    if (lt < 0 || lt > SCENE_LEN) continue;
    const out = lt > 3.7 ? (lt - 3.7) / 0.3 : 0;
    const ta = backOut((lt - 0.2) / 0.45), ba = easeOut((lt - 0.55) / 0.4);
    textBlock(c, sb.scenes[i].top, W / 2, 230 * k, 92 * k, 800, 1.12, clamp01((lt - 0.2) / 0.3) * (1 - out), (1 - ta) * 40 * k - out * 20 * k, k);
    textBlock(c, sb.scenes[i].bot, W / 2, 1400 * k, 54 * k, 700, 1.3, Math.max(0, ba) * (1 - out), (1 - ba) * 24 * k - out * 20 * k, k);
  }
  const slt = t - (clipEnd + 0.35);
  if (slt > 0 && t < clipEnd + SLOGAN_LEN + 0.3) {
    const out = t > clipEnd + SLOGAN_LEN ? (t - clipEnd - SLOGAN_LEN) / 0.3 : 0;
    const a = easeOut(slt / 0.5) * (1 - out);
    textBlock(c, sb.slogan, W / 2, 800 * k, 96 * k, 800, 1.14, a, (1 - easeOut(slt / 0.5)) * 40 * k, k);
    c.globalAlpha = a; c.fillStyle = GOLD; c.fillRect(W / 2 - 200 * k, 1060 * k, 400 * k * easeOut((slt - 0.45) / 0.6), 6 * k); c.globalAlpha = 1;
  }
  const ct = t - (clipEnd + SLOGAN_LEN + 0.35);
  if (ct > 0) {
    const fade = t > REEL_TOTAL - 0.3 ? Math.max(0, (REEL_TOTAL - t) / 0.3) : 1;
    const a = easeOut(ct / 0.55) * fade, dy = (1 - easeOut(ct / 0.55)) * 90 * k;
    c.font = `700 ${58 * k}px ${REEL_FONT}`;
    const lines = wrapWords(s => c.measureText(s).width, sb.cta, 790 * k).slice(0, 4);
    const lh = 58 * 1.25 * k, cardH = 128 * k + lines.length * lh + 34 * k + 112 * k;
    const x = 90 * k, y = 700 * k + dy, w = 900 * k;
    c.globalAlpha = a; c.fillStyle = GOLD; roundRect(c, x, y, w, cardH, 30 * k); c.fill();
    c.fillStyle = NAVY; c.textAlign = 'center'; c.textBaseline = 'top';
    lines.forEach((l, j) => c.fillText(l, W / 2, y + 64 * k + j * lh));
    const ky = y + 64 * k + lines.length * lh + 34 * k, sc = backOut((ct - 0.4) / 0.45) * 0.15 + 0.85;
    c.font = `800 ${84 * k}px ${REEL_FONT}`;
    const kw = c.measureText(sb.kw).width + 88 * k, kh = 112 * k;
    c.save(); c.translate(W / 2, ky + kh / 2); c.scale(sc, sc);
    c.fillStyle = NAVY; roundRect(c, -kw / 2, -kh / 2, kw, kh, 16 * k); c.fill();
    c.fillStyle = GOLD; c.textBaseline = 'middle'; c.fillText(sb.kw, 0, 4 * k); c.restore();
    if (sb.handle) {
      c.globalAlpha = a * 0.9 * clamp01((ct - 0.65) / 0.4); c.fillStyle = '#fff'; c.textBaseline = 'top';
      c.font = `600 ${44 * k}px ${REEL_FONT}`; c.fillText(sb.handle, W / 2, y + cardH + 60 * k);
    }
    c.globalAlpha = 1;
  }
}

// Sahne başına önizleme anı (yazıların tam göründüğü an)
export const previewTime = i => (i < SCENE_COUNT ? i * SCENE_LEN + 1.6 : i === SCENE_COUNT ? SCENE_COUNT * SCENE_LEN + 1.6 : REEL_TOTAL - 1.2);

// ====================================================================
// Tarayıcıda klip yükleme ve video üretimi
export function loadClip(file) {
  return new Promise((res, rej) => {
    const isImg = /^image\//.test(file.type);
    const m = document.createElement(isImg ? 'img' : 'video');
    const url = URL.createObjectURL(file);
    if (isImg) { m.onload = () => res(m); m.onerror = () => rej(new Error(file.name + ' açılamadı')); m.src = url; return; }
    m.muted = true; m.playsInline = true; m.preload = 'auto'; m.loop = true;
    m.onloadeddata = () => res(m); m.onerror = () => rej(new Error(file.name + ' açılamadı. Farklı bir klip deneyin.'));
    m.src = url;
  });
}
export function releaseClips(media) {
  for (const m of media) if (m && m.src && m.src.startsWith('blob:')) { try { m.pause?.(); } catch { /* yok */ } URL.revokeObjectURL(m.src); }
}

export async function loadReelFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([`800 92px Montserrat`, `700 54px Montserrat`, `600 44px Montserrat`].map(f => document.fonts.load(f))).catch(() => {});
}

// canvas üzerine videoyu gerçek zamanlı çizip kaydeder → { blob, ext, type, drops }
export async function renderReel({ canvas, sb, media, size = 1080, onProgress = () => {}, signal }) {
  const type = pickMimeType();
  if (!type || !canvas.captureStream) throw new Error('Bu tarayıcı video üretemiyor. Chrome\'un güncel sürümünü deneyin.');
  const W = size === 720 ? 720 : 1080, H = Math.round(W * 16 / 9);
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  await loadReelFonts();
  drawReelFrame(c, W, H, 0, media, sb);
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: W === 1080 ? 10e6 : 6e6 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  const started = new Array(SCENE_COUNT).fill(false);
  let drops = 0, aborted = false;
  rec.start(500);
  const t0 = performance.now(); let last = t0;
  await new Promise(resolve => {
    function tick(now) {
      if (signal?.aborted) { aborted = true; return resolve(); }
      const t = (now - t0) / 1000;
      if (now - last > 70) drops++;
      last = now;
      media.forEach((m, i) => {
        if (!m || m.tagName !== 'VIDEO') return;
        if (!started[i] && t >= i * SCENE_LEN - 0.1) { started[i] = true; m.currentTime = 0; m.play().catch(() => {}); }
        if (started[i] && t > (i + 1) * SCENE_LEN + XF + 0.1 && !m.paused) m.pause();
      });
      drawReelFrame(c, W, H, Math.min(t, REEL_TOTAL), media, sb);
      onProgress(Math.min(1, t / REEL_TOTAL));
      if (t >= REEL_TOTAL) return resolve();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach(tr => tr.stop());
  media.forEach(m => m?.pause?.());
  if (aborted) throw new Error('Üretim durduruldu.');
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext, type, drops, width: W, height: H };
}

export const reelFileName = (topic, ext) =>
  'reels-' + (String(topic || 'video').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video') + '.' + ext;
