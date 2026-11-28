// Reels Stüdyosu motoru: senaryo (storyboard) modeli + tarayıcıda video üretimi (Canvas + MediaRecorder).
// Sunucu yok; video kullanıcının telefonunda üretilir ve orada kalır. Saf fonksiyonlar Node testlerinde de çalışır.
import { checkMessage } from '../iletisim/uyum.js';

export const REEL_SCHEMA = 2;   // 2: sahne sayısı (2–8) ve sahne süresi esnek
export const SCENE_COUNT = 4;   // varsayılan sahne sayısı (şablon)
export const MIN_SCENES = 2, MAX_SCENES = 8;
export const SEC_MIN = 2.5, SEC_MAX = 8;
export const SCENE_LEN = 4.0;   // varsayılan sahne süresi (sn)
export const XF = 0.3;          // sahne geçişi (sn)
export const SLOGAN_LEN = 3.0;
export const CTA_LEN = 3.5;
export const REEL_TOTAL = SCENE_COUNT * SCENE_LEN + SLOGAN_LEN + CTA_LEN; // varsayılan şablon: 22,5 sn

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
// En fazla N satır: 1. satır beyaz, sonrakiler altın
const nLines = (v, n, max) => clip(v, n).split('\n').map(x => x.trim()).filter(Boolean).slice(0, max).join('\n');
const twoLines = (v, n) => nLines(v, n, 2);
const secOf = v => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.min(SEC_MAX, Math.max(SEC_MIN, Math.round(x * 2) / 2)) : SCENE_LEN; };

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
    v: REEL_SCHEMA, template, scenes: t.scenes, slogan: t.slogan, cta: t.cta,
    kw: brand.kw, handle: brand.handle
  });
}

// Kendi metin modu için boş başlangıç
export function blankStoryboard(brand = {}) {
  return normalizeStoryboard({ v: REEL_SCHEMA, mode: 'metin', scenes: [{}, {}, {}], slogan: '', kw: brand.kw, handle: brand.handle });
}

// Veritabanından ya da AI'dan gelen her şeyi güvenli, sabit biçime çevir (şema sürümüyle)
export function normalizeStoryboard(raw = {}) {
  const t = TEMPLATES[raw.template] ? raw.template : 'mesai';
  const base = TEMPLATES[t];
  const list = Array.isArray(raw.scenes) ? raw.scenes : [];
  // Şema 1 (eski kayıtlar) hep 4 sahnedir; şema 2'de 2–8 sahne
  const n = raw.v >= 2 ? Math.min(MAX_SCENES, Math.max(MIN_SCENES, list.length || SCENE_COUNT)) : SCENE_COUNT;
  const own = raw.mode === 'metin';
  const scenes = Array.from({ length: n }, (_, i) => {
    const s = list[i] || {};
    const b = own ? { top: '', bot: '' } : (base.scenes[i] || { top: '', bot: '' });
    return { top: twoLines(s.top ?? b.top, 60), bot: nLines(s.bot ?? b.bot, 140, 4), sec: secOf(s.sec) };
  });
  return {
    v: REEL_SCHEMA, template: t, mode: own ? 'metin' : 'ai', scenes,
    slogan: twoLines(raw.slogan ?? (own ? '' : base.slogan), 60),
    cta: clip(raw.cta ?? base.cta, 90).replace(/\n+/g, ' ').trim(),
    kw: normalizeKeyword(raw.kw),
    handle: normalizeHandle(raw.handle),
    src: own ? clip(raw.src, 4000) : ''
  };
}

// Zaman çizelgesi: sahnelerin başlangıçları, klip bölümünün sonu, slogan ve toplam süre
export function timeline(sb) {
  const starts = []; let t = 0;
  for (const sc of sb.scenes) { starts.push(t); t += secOf(sc.sec); }
  const slogan = sb.slogan ? SLOGAN_LEN : 0;
  return { starts, clipEnd: t, slogan, total: t + slogan + CTA_LEN, sec: i => secOf(sb.scenes[i] && sb.scenes[i].sec) };
}
export const reelTotal = sb => timeline(sb).total;

// ====================================================================
// Kendi metnin → sahneler. Kelimelere dokunmaz; yalnızca böler ve satırlara yerleştirir.
const WORDS = t => String(t || '').trim().split(/\s+/).filter(Boolean);
// Kısa metni en fazla 2 satıra, satır başı ~22 karaktere böl (sığmazsa null)
export function wrapTwo(text, max = 22) {
  const lines = wrapWords(x => x.length, text, max);
  return lines.length <= 2 && lines.every(l => l.length <= max + 6) ? lines.join('\n') : null;
}
// Okuma süresine göre sahne süresi: saniyede ~2,6 kelime + 1,2 sn pay
export const readSec = text => secOf(Math.max(3, WORDS(text).length / 2.6 + 1.2));

export function parseScript(text, { max = MAX_SCENES } = {}) {
  const warnings = [];
  let body = String(text || '').replace(/\r/g, '').trim();
  let slogan = '', cta = '';
  body = body.split('\n').filter(line => {
    const m = line.match(/^\s*(slogan|cta|çağrı|kapanış)\s*[:：]\s*(.*)$/i);
    if (!m) return true;
    if (/^slogan$/i.test(m[1])) slogan = m[2].trim(); else cta = m[2].trim();
    return false;
  }).join('\n').trim();
  // Bloklar: boş satır, --- ya da "Sahne 3:" başlıkları
  let blocks = body.split(/\n\s*\n|\n\s*-{3,}\s*\n|\n(?=\s*sahne\s*\d+\s*[:.)-])/i)
    .map(b => b.replace(/^\s*-{3,}\s*$/gm, '').replace(/^\s*sahne\s*\d+\s*[:.)-]\s*/i, '').trim()).filter(Boolean);
  // Tek blok: satır satır; tek satırsa cümle cümle böl
  if (blocks.length === 1) {
    const lines = blocks[0].split('\n').map(x => x.trim()).filter(Boolean);
    blocks = lines.length > 1 ? lines : (blocks[0].match(/[^.!?…]+[.!?…]*/g) || [blocks[0]]).map(x => x.trim()).filter(Boolean);
  }
  if (blocks.length > max) {
    // Fazlası birleştirilir; kelime kaybolmaz
    const per = Math.ceil(blocks.length / max), merged = [];
    for (let i = 0; i < blocks.length; i += per) merged.push(blocks.slice(i, i + per).join(' '));
    warnings.push(`${blocks.length} parça vardı; ${merged.length} sahneye birleştirildi.`);
    blocks = merged;
  }
  const scenes = blocks.map(b => {
    const lines = b.split('\n').map(x => x.trim()).filter(Boolean);
    let top = '', bot = '';
    if (lines.length >= 2) {
      const t2 = lines[0].length <= 44 ? wrapTwo(lines[0]) : null;
      if (t2) { top = t2; bot = lines.slice(1).join(' '); } else bot = lines.join(' ');
    } else {
      const t2 = lines[0].length <= 40 ? wrapTwo(lines[0]) : null;
      if (t2) top = t2; else bot = lines[0];
    }
    if (bot.length > 140) warnings.push(`"${bot.slice(0, 30)}…" çok uzun; videoda kısaltılır. Bu sahneyi ikiye böl.`);
    return { top, bot: bot.slice(0, 140), sec: readSec(`${top} ${bot}`) };
  });
  if (scenes.length < MIN_SCENES) warnings.push('Metin kısa; en az 2 sahne gerekir, boş sahneyi doldur.');
  while (scenes.length < MIN_SCENES) scenes.push({ top: '', bot: '', sec: SCENE_LEN });
  return { scenes, slogan, cta, warnings };
}

// Metne sadakat: çıktıdaki kelimelerin kaynakta geçme oranı (AI düzenlemesini denetlemek için)
export function fidelity(src, sb) {
  const norm = w => w.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
  const have = new Set(WORDS(src).map(norm).filter(Boolean));
  const out = WORDS([...sb.scenes.flatMap(x => [x.top, x.bot]), sb.slogan].join(' ')).map(norm).filter(Boolean);
  if (!out.length) return 1;
  return out.filter(w => have.has(w)).length / out.length;
}

export function aiScriptPrompt(text) {
  return `Aşağıdaki Reels metnini kısa video sahnelerine böl. METNE SADIK KAL: kelime ekleme, çıkarma, değiştirme; yalnızca sahnelere ve satırlara böl.
Kurallar:
- ${MIN_SCENES}-${MAX_SCENES} sahne. Her sahne: "top" = kısa vurgulu başlık (en fazla 2 satır, satır başı ~20 karakter), "bot" = alt yazı (en fazla 3 satır, toplam 120 karakter). Satırları \\n ile ayır. Başlığa uygun kısa ifade yoksa "top" boş kalabilir.
- "sec" = sahnenin ekranda kalma süresi (okuma hızına göre 3-7 sn).
- Metinde açıkça slogan ya da kapanış/çağrı cümlesi varsa "slogan" ve "cta" alanlarına koy; yoksa boş bırak.
- Metindeki hiçbir cümleyi atlama.
METİN BAŞI
${String(text).slice(0, 3500)}
METİN SONU
Sadece şu biçimde JSON döndür:
{"scenes":[{"top":"...","bot":"...","sec":4}],"slogan":"","cta":""}`;
}
export function parseAiScript(j, current, src) {
  if (!j || !Array.isArray(j.scenes) || j.scenes.length < MIN_SCENES) throw new Error('AI sahneleri eksik geldi; tekrar deneyin ya da "Sahnelere böl"ü kullanın.');
  return normalizeStoryboard({ ...current, v: REEL_SCHEMA, mode: 'metin', src, scenes: j.scenes,
    slogan: j.slogan || '', cta: j.cta || current.cta });
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
  return normalizeStoryboard({ ...current, v: REEL_SCHEMA, mode: 'ai', src: '', scenes: j.scenes.slice(0, SCENE_COUNT).map(x => ({ ...x, sec: SCENE_LEN })), slogan: j.slogan, cta: j.cta });
}

// Paylaşım metni önerisi (caption)
export function suggestCaption(sb, topic = '') {
  const flat = s => s.replace(/\n/g, ' ');
  const first = `${flat(sb.scenes[0].top)} ${flat(sb.scenes[0].bot)}`.trim();
  const lines = [first ? (/[.!?…]$/.test(first) ? first : first + '.') : '',
    flat(sb.slogan), `${flat(sb.cta).replace(/:$/, '')} ${sb.kw}`].filter(Boolean);
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
function drawDots(c, W, H, t, k, total = REEL_TOTAL) {
  const p = t / total;
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
// Alt yazı: açık satırlar korunur, uzunlar sarılır; ilk satır beyaz, sonrakiler altın. Çok satırda yazı küçülür.
function subBlock(c, text, cx, y, size, weight, alpha, dy, k) {
  if (alpha <= 0 || !text) return;
  const layout = sz => {
    c.font = `${weight} ${sz}px ${REEL_FONT}`;
    const parts = text.split('\n').map((l, i) => ({ lines: wrapWords(s => c.measureText(s).width, l, 960 * k), gold: i > 0 }));
    return { parts, n: parts.reduce((a, p) => a + p.lines.length, 0) };
  };
  let sz = size, L = layout(sz);
  if (L.n > 3) { sz = size * (L.n > 4 ? 0.74 : 0.86); L = layout(sz); }
  const lh = sz * 1.28, top = y + dy - Math.max(0, L.n - 2) * lh * 0.5;
  c.globalAlpha = alpha; c.textAlign = 'center'; c.textBaseline = 'top';
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 22 * k;
  let row = 0;
  for (const p of L.parts) for (const l of p.lines) { if (row >= 6) break; c.fillStyle = p.gold ? GOLD : '#fff'; c.fillText(l, cx, top + row++ * lh); }
  c.shadowBlur = 0; c.globalAlpha = 1;
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
  const tl = timeline(sb), N = sb.scenes.length, clipEnd = tl.clipEnd, TOTAL = tl.total, SL = tl.slogan;
  drawBg(c, W, H);
  if (t < clipEnd + XF) {
    for (let i = 0; i < N; i++) {
      const s0 = tl.starts[i], len = tl.sec(i);
      if (t < s0 || t > s0 + len + XF) continue;
      const lt = t - s0;
      let a = i === 0 ? easeOut(lt / 0.5) : Math.min(1, lt / XF);
      if (t > s0 + len) a *= 1 - (t - s0 - len) / XF;
      c.globalAlpha = Math.max(0, a);
      const m = media[i];
      if (!(m && drawCover(c, m, W, H, 1 + 0.06 * (lt / (len + XF))))) drawDemo(c, W, H, i, lt);
      c.globalAlpha = 1;
    }
    const sa = t < 0.45 ? t / 0.4 : t > clipEnd - 0.05 ? Math.max(0, 1 - (t - clipEnd + 0.05) / 0.35) : 1;
    c.globalAlpha = clamp01(sa); drawShade(c, W, H);
    c.strokeStyle = 'rgba(201,162,74,.85)'; c.lineWidth = 20 * k; c.strokeRect(0, 0, W, H);
    c.globalAlpha = 1;
  }
  drawDots(c, W, H, t, k, TOTAL);
  for (let i = 0; i < N; i++) {
    const lt = t - tl.starts[i], len = tl.sec(i);
    if (lt < 0 || lt > len) continue;
    const out = lt > len - 0.3 ? (lt - len + 0.3) / 0.3 : 0;
    const ta = backOut((lt - 0.2) / 0.45), ba = easeOut((lt - (sb.scenes[i].top ? 0.55 : 0.2)) / 0.4);
    textBlock(c, sb.scenes[i].top, W / 2, 230 * k, 92 * k, 800, 1.12, clamp01((lt - 0.2) / 0.3) * (1 - out), (1 - ta) * 40 * k - out * 20 * k, k);
    subBlock(c, sb.scenes[i].bot, W / 2, 1400 * k, 54 * k, 700, Math.max(0, ba) * (1 - out), (1 - ba) * 24 * k - out * 20 * k, k);
  }
  const slt = t - (clipEnd + 0.35);
  if (SL && slt > 0 && t < clipEnd + SL + 0.3) {
    const out = t > clipEnd + SL ? (t - clipEnd - SL) / 0.3 : 0;
    const a = easeOut(slt / 0.5) * (1 - out);
    textBlock(c, sb.slogan, W / 2, 800 * k, 96 * k, 800, 1.14, a, (1 - easeOut(slt / 0.5)) * 40 * k, k);
    c.globalAlpha = a; c.fillStyle = GOLD; c.fillRect(W / 2 - 200 * k, 1060 * k, 400 * k * easeOut((slt - 0.45) / 0.6), 6 * k); c.globalAlpha = 1;
  }
  const ct = t - (clipEnd + SL + 0.35);
  if (ct > 0) {
    const fade = t > TOTAL - 0.3 ? Math.max(0, (TOTAL - t) / 0.3) : 1;
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
// i: sahne sırası; N = slogan; N+1 = kapanış
export function previewTime(i, sb = null) {
  if (!sb) return i < SCENE_COUNT ? i * SCENE_LEN + 1.6 : i === SCENE_COUNT ? SCENE_COUNT * SCENE_LEN + 1.6 : REEL_TOTAL - 1.2;
  const tl = timeline(sb), N = sb.scenes.length;
  if (i < N) return tl.starts[i] + Math.min(1.6, tl.sec(i) - 0.35);
  if (i === N && tl.slogan) return tl.clipEnd + 1.6;
  return tl.total - 1.2;
}

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
// outro: isteğe bağlı logo animasyon videosu (video öğesi); sona eklenir, en fazla 8 sn
export async function renderReel({ canvas, sb, media, size = 1080, onProgress = () => {}, signal, outro = null }) {
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
  const tl = timeline(sb), BODY = tl.total;
  const OUT = outro && outro.duration ? Math.min(8, outro.duration) : 0;
  const TOTAL = BODY + OUT;
  let outroStarted = false;
  const started = new Array(sb.scenes.length).fill(false);
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
        if (i >= sb.scenes.length) return;
        if (!started[i] && t >= tl.starts[i] - 0.1) { started[i] = true; m.currentTime = 0; m.play().catch(() => {}); }
        if (started[i] && t > tl.starts[i] + tl.sec(i) + XF + 0.1 && !m.paused) m.pause();
      });
      if (OUT && t >= BODY) {
        if (!outroStarted) { outroStarted = true; outro.currentTime = 0; outro.play().catch(() => {}); }
        drawOutro(c, W, H, outro);
      } else drawReelFrame(c, W, H, Math.min(t, BODY), media, sb);
      onProgress(Math.min(1, t / TOTAL));
      if (t >= TOTAL) return resolve();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach(tr => tr.stop());
  media.forEach(m => m?.pause?.()); outro?.pause?.();
  if (aborted) throw new Error('Üretim durduruldu.');
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext, type, drops, width: W, height: H };
}

// Logo videosu: koyu zemin üzerinde, kırpmadan ortala
export function drawOutro(c, W, H, v) {
  c.globalAlpha = 1; c.fillStyle = DEEP; c.fillRect(0, 0, W, H);
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw) return;
  const sc = Math.min(W / vw, H / vh), dw = vw * sc, dh = vh * sc;
  c.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Logo videosunu çizilebilir hale getir (aynı kaynaklı blob: tuval kirlenmez)
export async function loadOutro(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error('Logo videosu indirilemedi.');
  const blob = await res.blob();
  return new Promise((ok, no) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadeddata = () => ok(v); v.onerror = () => no(new Error('Logo videosu açılamadı.'));
    v.src = URL.createObjectURL(blob);
  });
}

export const reelFileName = (topic, ext) =>
  'reels-' + (String(topic || 'video').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video') + '.' + ext;

// Dış araçtan (Canva, Higgsfield, Kling, CapCut…) gelen videonun sonuna logo videosunu ekler.
// Tarayıcıda gerçek zamanlı yeniden kayıt: video süresi + logo süresi kadar sürer; orijinal ses korunur.
const AV_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
export async function appendOutro({ file, outro, canvas, onProgress = () => {} }) {
  if (!outro) throw new Error('Önce Marka kitinden logo videosunu yükle.');
  const MR = globalThis.MediaRecorder;
  if (!MR || !canvas.captureStream) throw new Error('Bu tarayıcı video işleyemiyor. Chrome\'un güncel sürümünü deneyin.');
  const src = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.src = src;
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('Video açılamadı; MP4 ya da MOV yükleyin.')); });
  const W0 = v.videoWidth || 1080, H0 = v.videoHeight || 1920, k = Math.min(1, 1080 / W0);
  const W = Math.round(W0 * k / 2) * 2, H = Math.round(H0 * k / 2) * 2;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  let ac = null;
  try {
    ac = new AudioContext();
    const node = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination();
    node.connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    await ac.resume();
  } catch { /* ses yoksa yalnızca görüntü */ }
  const hasAudio = stream.getAudioTracks().length > 0;
  const type = (hasAudio ? AV_TYPES : MIME_TYPES).find(t => MR.isTypeSupported(t));
  if (!type) throw new Error('Bu tarayıcı video kaydedemiyor.');
  const rec = new MR(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 60;
  const OUT = Math.min(8, outro.duration || 4);
  rec.start(500);
  await v.play();
  let outroAt = 0;
  await new Promise(resolve => {
    function tick(now) {
      if (!outroAt && !v.ended && v.currentTime < dur - 0.02) {
        c.drawImage(v, 0, 0, W, H);
        onProgress(Math.min(1, v.currentTime / (dur + OUT)));
      } else {
        if (!outroAt) { outroAt = now; v.pause(); outro.currentTime = 0; outro.play().catch(() => {}); }
        drawOutro(c, W, H, outro);
        const t = (now - outroAt) / 1000;
        onProgress(Math.min(1, (dur + t) / (dur + OUT)));
        if (t >= OUT) return resolve();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  rec.stop(); await stopped;
  stream.getTracks().forEach(t => t.stop());
  outro.pause(); v.pause(); URL.revokeObjectURL(src);
  if (ac) ac.close().catch(() => {});
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext, type, width: W, height: H };
}

// ---- Senaryonun tamamını tek metin olarak düzenleme ----
// Biçim: her sahne "Sahne N · X sn" satırıyla başlar; başlık satırları, tek "-" satırı, alt yazı satırları.
// Sonda "Slogan:" (satırlar " / " ile) ve "Çağrı:" satırları.
export function storyboardToText(sb) {
  const scenes = sb.scenes.map((sc, i) => [`Sahne ${i + 1} · ${String(secOf(sc.sec)).replace('.', ',')} sn`, sc.top, '-', sc.bot]
    .filter((x, j) => j !== 1 || x).join('\n').trim());
  const tail = [`Slogan: ${String(sb.slogan || '').replace(/\n/g, ' / ')}`, `Çağrı: ${sb.cta || ''}`];
  return [...scenes, tail.join('\n')].join('\n\n');
}
export function textToStoryboard(text, sb) {
  const warnings = [];
  let slogan = sb.slogan, cta = sb.cta;
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(line => {
    const m = line.match(/^\s*(slogan|çağrı|cta)\s*[:：]\s*(.*)$/i);
    if (!m) return true;
    if (/^slogan$/i.test(m[1])) slogan = m[2].split(/\s*\/\s*/).join('\n').trim(); else cta = m[2].trim();
    return false;
  });
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^\s*\[?\s*sahne\s*\d+\s*(?:[·.:\-–]\s*(\d+(?:[.,]\d)?)\s*(?:sn|saniye)?)?\s*\]?\s*:?\s*$/i);
    if (h) { cur = { sec: h[1] ? Number(h[1].replace(',', '.')) : null, lines: [] }; blocks.push(cur); continue; }
    if (!cur) { if (!line.trim()) continue; cur = { sec: null, lines: [] }; blocks.push(cur); }
    cur.lines.push(line);
  }
  const scenes = blocks.map((b, i) => {
    const ls = b.lines.map(x => x.trim());
    while (ls.length && !ls[ls.length - 1]) ls.pop();
    while (ls.length && !ls[0]) ls.shift();
    const sep = ls.findIndex(x => /^[-–—]{1,3}$/.test(x));
    let top, bot;
    if (sep >= 0) { top = ls.slice(0, sep).filter(Boolean).join('\n'); bot = ls.slice(sep + 1).filter(Boolean).join('\n'); }
    else { const f = ls.filter(Boolean); top = f[0] || ''; bot = f.slice(1).join('\n'); }
    if (top.split('\n').length > 2 || top.length > 60) warnings.push(`Sahne ${i + 1}: başlık en fazla 2 satır / 60 karakter olabilir; fazlası kesilir.`);
    if (bot.split('\n').length > 4 || bot.length > 140) warnings.push(`Sahne ${i + 1}: alt yazı en fazla 4 satır / 140 karakter olabilir; fazlası kesilir.`);
    return { top, bot, sec: b.sec ?? sb.scenes[i]?.sec ?? readSec(`${top} ${bot}`) };
  }).filter(sc => sc.top || sc.bot);
  if (scenes.length > MAX_SCENES) warnings.push(`${scenes.length} sahne var; ilk ${MAX_SCENES} sahne kullanıldı.`);
  if (scenes.length < MIN_SCENES) throw new Error(`En az ${MIN_SCENES} sahne gerekli. Sahneleri "Sahne 1", "Sahne 2" satırlarıyla ayır.`);
  return { sb: normalizeStoryboard({ ...sb, v: REEL_SCHEMA, scenes: scenes.slice(0, MAX_SCENES), slogan, cta }), warnings };
}
