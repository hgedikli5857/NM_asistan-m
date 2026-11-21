// Karusel Stüdyosu motoru: Instagram karusel (4:5, 1080×1350) sayfa modeli + Canvas ile tarayıcıda görsel üretimi.
// Sunucu yok; görseller kullanıcının cihazında üretilir. Saf fonksiyonlar (model, ayrıştırma, AI istemi) Node testlerinde de çalışır.
import { checkMessage } from '../iletisim/uyum.js';

export const DECK_SCHEMA = 1;
export const W = 1080, H = 1350;
export const MIN_SLIDES = 3, MAX_SLIDES = 10;

export const LAYOUTS = {
  kapak: { label: 'Kapak', hint: 'Rozet, büyük başlık, altın şerit, kısa açıklama' },
  fikir: { label: 'Ana fikir', hint: 'Başlık, paragraf ve simge' },
  uclu: { label: 'Üçlü kutu', hint: 'Paragraf + 3 kısa madde yan yana' },
  liste: { label: 'Satır listesi', hint: 'Etiket + metin satırları (en fazla 4)' },
  adim: { label: 'Adımlar', hint: '3 numaralı adım kartı' },
  kapanis: { label: 'Kapanış', hint: 'Özet, "Bizi takip edin", iletişim bilgileri' }
};
export const EMBLEMS = { soru: 'Soru', hedef: 'Hedef', kalp: 'Kalp', sohbet: 'Sohbet', zirve: 'Zirve', kum: 'Kum saati' };
const DEFAULT_EMBLEM = { kapak: 'soru', fikir: 'sohbet', uclu: 'kalp', liste: 'soru', adim: 'kum', kapanis: 'zirve' };

const clip = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const oneLine = (v, n) => clip(v, n).replace(/\s*\n+\s*/g, ' ');

export function normalizeSlide(raw = {}, i = 0, total = 1) {
  let layout = LAYOUTS[raw.layout] ? raw.layout : (i === 0 ? 'kapak' : i === total - 1 ? 'kapanis' : 'fikir');
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, layout === 'liste' ? 4 : 3).map(x =>
    typeof x === 'string' ? { label: '', text: oneLine(x, 120) } : { label: oneLine(x?.label, 26), text: oneLine(x?.text, 120) })
    .filter(x => x.label || x.text);
  if ((layout === 'uclu' || layout === 'adim' || layout === 'liste') && !items.length) layout = 'fikir';
  return {
    layout,
    badge: oneLine(raw.badge, 34),
    title: clip(raw.title, 80),
    ribbon: oneLine(raw.ribbon, 120),
    body: clip(raw.body, 460),
    items,
    quote: oneLine(raw.quote, 96),
    emblem: EMBLEMS[raw.emblem] ? raw.emblem : DEFAULT_EMBLEM[layout]
  };
}

export function normalizeHandleK(v) {
  const h = String(v || '').trim().replace(/\s+/g, '').replace(/^@*/, '');
  return h ? '@' + h.slice(0, 30) : '';
}
export function normalizeBrand(b = {}) {
  return {
    name: oneLine(b.name, 40),
    web: oneLine(b.web, 60).replace(/^https?:\/\//, ''),
    wa: oneLine(b.wa, 120),
    handle: normalizeHandleK(b.handle),
    follow: oneLine(b.follow ?? 'Bireysel girişimci olmak, wellness ürünlerimiz hakkında bilgi almak ve daha fazlası için bizi takip edin.', 140)
  };
}

export function normalizeDeck(raw = {}) {
  const src = Array.isArray(raw.slides) ? raw.slides.slice(0, MAX_SLIDES) : [];
  const slides = src.map((s, i) => normalizeSlide(s, i, src.length));
  return { v: DECK_SCHEMA, topic: oneLine(raw.topic, 200), slides, brand: normalizeBrand(raw.brand) };
}

// Örnek: beğenilen "Soru Sorarak Satış Kapatma Sanatı" karuselinin yapısı
export function sampleDeck(brand = {}) {
  return normalizeDeck({
    topic: 'Soru sorarak görüşmeyi yönlendirmek',
    brand,
    slides: [
      { layout: 'kapak', badge: '6 Sayfalık Rehber', title: 'Soru Sorarak *Güven* Kurmak', ribbon: 'Baskı kurmadan yönlendirme yaklaşımı',
        body: 'Bu yaklaşımın amacı; karşınızdakini uzun anlatımlarla yormak yerine, doğru sorularla kendi ihtiyacını fark etmesini ve kararına kendi cümleleriyle ulaşmasını sağlamaktır.',
        quote: 'İkna etmeye çalışmak yerine *fark ettirmeye* odaklan.' },
      { layout: 'fikir', badge: '1. Ana Fikir', title: 'İkna Etmek Direnç Yaratır, Soru Sormak Fark Ettirir',
        body: 'Ürünü ya da fikri üst üste anlatmak karşı tarafta savunma refleksi oluşturabilir. İnsanlar, kendi ulaştıkları sonuçlara daha çok inanır. Güçlü sorular, kişiyi sürecin içine katar.',
        quote: 'İyi bir görüşme, *anlatmak* değil fark ettirmektir.' },
      { layout: 'uclu', badge: '2. Öne Çıkan Strateji', title: 'Doğru Niyet ve *Psikolojik Oksijen*',
        body: 'Karşınızdaki kişi ne kadar bildiğinizle değil, onu ne kadar önemsediğinizle ilgilenir. Aktif dinlemek, anlaşıldığını hissettirir.',
        items: [{ label: 'Baskı değil', text: 'İlgi ve anlayış' }, { label: 'Aktif dinleme', text: 'Güven oluşturur' }, { label: 'Önce bağ kur', text: 'Sonra yönlendir' }],
        quote: 'İnsanlar en çok, gerçekten *dinlendiklerinde* açılır.' },
      { layout: 'liste', badge: '3. Soru Seçimi', title: 'İlişki Sıcaklığına Göre Soru Seçimi', ribbon: 'Her kişiyle aynı dilden konuşulmaz; sorunun tonu ilişkiye göre değişir.',
        items: [{ label: 'Sıcak çevre', text: 'Bu işi birlikte yapsaydık, ilk adımda nereye odaklanırdık?' },
          { label: 'Ilık çevre', text: 'Şu an zamanını en çok neye ayırmak isterdin?' },
          { label: 'Soğuk çevre', text: 'İdeal gününü düşündüğünde, bugün ona ne kadar yakınsın?' }],
        quote: 'Doğru soru, kişinin kendini *rahatça ifade etmesini* sağlar.' },
      { layout: 'adim', badge: '4. Derinleştirme Tekniği', title: 'Sessizlik de Bir *İletişim* Aracıdır',
        body: 'Kişi bir sıkıntısını anlatırken araya girmeyin. Kısa bir sessizlik, asıl söylemek istediğini ifade etmesini kolaylaştırır.',
        items: [{ label: 'Dinle', text: 'Sözünü kesmeden sonuna kadar dinle.' }, { label: 'Es ver', text: 'Kısa bir sessizlik bırak, hemen çözüm sunma.' }, { label: 'Derinleştir', text: '"Anlıyorum" diyerek duyguyu açmasına alan tanı.' }],
        quote: 'Bazen en güçlü soru, *sorudan sonraki* sessizliktir.' },
      { layout: 'kapanis', badge: 'Son Sayfa', title: 'Soruyla Başla, *Güvenle* İlerle',
        body: 'Doğru sorular ihtiyacı görünür kılar, güven oluşturur ve kişiyi kendi kararına yaklaştırır.',
        quote: 'Güven, *doğru sorularla* başlar.' }
    ]
  });
}

// Görselde görünen tüm metin (uyum kontrolü)
export function deckText(d) {
  return d.slides.flatMap(s => [s.badge, s.title, s.ribbon, s.body, ...s.items.flatMap(x => [x.label, x.text]), s.quote])
    .filter(Boolean).join('\n').replace(/\*/g, '');
}
export function deckFindings(d) {
  const f = checkMessage(deckText(d));
  if (d.slides.length < MIN_SLIDES) f.push({ cat: 'Sayfa sayısı', level: 'orta', tip: `Karusel en az ${MIN_SLIDES} sayfa olmalı.`, hits: [String(d.slides.length)] });
  return f;
}

// "Ben vereyim": düz metni sayfalara ayır.
// Sayfalar "---" ile ayrılır. Satır başları: "[düzen] Rozet", "# Başlık", "== Şerit", "- Etiket: metin", "> Alıntı", geri kalanı paragraf.
export function parseDeckText(text, brand = {}) {
  const blocks = String(text || '').replace(/\r/g, '').split(/^\s*-{3,}\s*$/m).map(b => b.trim()).filter(Boolean);
  const raws = blocks.map(b => {
    const s = { items: [], body: '' };
    const body = [];
    for (const lineRaw of b.split('\n')) {
      const line = lineRaw.trim();
      if (!line) { if (body.length) body.push(''); continue; }
      let m;
      if ((m = line.match(/^\[(\p{L}+)\]\s*(.*)$/u))) {
        const key = m[1].toLocaleLowerCase('tr-TR').replace('ı', 'i');
        const map = { kapak: 'kapak', fikir: 'fikir', uclu: 'uclu', üçlü: 'uclu', liste: 'liste', adim: 'adim', adım: 'adim', kapanis: 'kapanis', kapanış: 'kapanis' };
        s.layout = map[key] || map[m[1].toLocaleLowerCase('tr-TR')];
        if (m[2]) s.badge = m[2];
      } else if ((m = line.match(/^#+\s*(.+)$/))) s.title = s.title ? s.title + ' ' + m[1] : m[1];
      else if ((m = line.match(/^==+\s*(.+)$/))) s.ribbon = m[1];
      else if ((m = line.match(/^>\s*(.+)$/))) s.quote = m[1];
      else if ((m = line.match(/^[-•*]\s+(.+)$/)) || (m = line.match(/^\d+[.)]\s+(.+)$/))) {
        const t = m[1]; const k = t.indexOf(':');
        s.items.push(k > 0 && k < 30 ? { label: t.slice(0, k).trim(), text: t.slice(k + 1).trim() } : { label: '', text: t });
      } else body.push(line);
    }
    s.body = body.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (!s.layout && s.items.length) {
      s.layout = /^\d/.test(b.split('\n').find(l => /^\s*\d+[.)]/.test(l)) || '') ? 'adim'
        : s.items.length <= 3 && s.items.every(x => x.text.length <= 30) ? 'uclu' : 'liste';
    }
    if (!s.title && s.body) { const sentence = s.body.split(/(?<=[.!?])\s/)[0]; s.title = sentence.slice(0, 70); s.body = s.body.slice(sentence.length).trim(); }
    return s;
  });
  return normalizeDeck({ slides: raws, brand });
}

// AI istemleri
const RULES = `Kurallar:
- Hedef kitle Instagram takipçileri; ton samimi, profesyonel, abartısız. Okura "siz" ya da genel anlatım. Emoji yok.
- Yasak: "network marketing", "MLM", "çok katmanlı"; kazanç, gelir, para, prim, rakam vaadi; sağlık iddiası (tedavi, iyileşme, hastalık adı). Ürün anılırsa "patch" de, "bant" deme. "Garanti" ve baskı yok.
- Gerekirse işi "bireysel girişimcilik" diye an.
- Her sayfada "quote": tek, akılda kalan cümle (en fazla 70 karakter); vurgulanacak 1-3 kelimeyi *yıldız* içine al.
- "title" en fazla 55 karakter; istersen 1-2 kelimeyi *yıldız* içine al (altın renkte görünür).
- "body" en fazla 300 karakter. "badge" kısa: "1. Ana Fikir", "2. Öne Çıkan Strateji" gibi; kapakta "N Sayfalık Rehber", sonda "Son Sayfa".
- layout seçenekleri: kapak (ilk), fikir (paragraf), uclu (3 kısa madde: label ≤ 16, text ≤ 30 karakter), liste (2-4 satır: label ≤ 14, text ≤ 90), adim (3 adım: label ≤ 14, text ≤ 60), kapanis (son).
- emblem seçenekleri: soru, hedef, kalp, sohbet, zirve, kum.`;
const SHAPE = `Sadece şu biçimde JSON döndür:
{"slides":[{"layout":"kapak","badge":"...","title":"...","ribbon":"...","body":"...","items":[],"quote":"...","emblem":"soru"}, ...]}`;

export function aiDeckPrompt(topic, count = 8) {
  const n = Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, count | 0));
  return `Instagram karuseli için ${n} sayfalık içerik yaz. Konu: ${topic}
Yazan: işinin yanında bireysel girişimcilik yapan, sağlıklı yaşam ve kişisel gelişim alanında içerik üreten bir girişimci.
İlk sayfa kapak, son sayfa kapanis olsun; aradakilerde düzenleri çeşitlendir (en az bir uclu, bir liste ya da adim).
${RULES}
${SHAPE}`;
}
export function aiStructurePrompt(text, count = 0) {
  return `Aşağıdaki metni Instagram karusel sayfalarına böl. Kullanıcının kelimelerini ve anlamını koru; yalnızca kısalt ve sayfalara yerleştir.${count ? ` ${count} sayfa olsun.` : ''}
İlk sayfa kapak, son sayfa kapanis olsun.
${RULES}
Metin:
«${String(text).slice(0, 6000)}»
${SHAPE}`;
}
export function parseAiDeck(j, current) {
  if (!j || !Array.isArray(j.slides) || j.slides.length < MIN_SLIDES) throw new Error('AI karuseli eksik geldi, tekrar deneyin.');
  return normalizeDeck({ ...current, slides: j.slides });
}

export function suggestCaptionK(d) {
  const strip = s => String(s || '').replace(/\*/g, '');
  const first = d.slides[0] || {};
  const pts = d.slides.slice(1, -1).map(s => '• ' + strip(s.title)).slice(0, 6).join('\n');
  return [strip(first.title), first.body ? strip(first.body) : '', pts, 'Kaydedin, ihtiyacı olan biriyle paylaşın.', d.brand.handle].filter(Boolean).join('\n\n').slice(0, 2200);
}

export const deckFileName = (topic, i) =>
  'karusel-' + (String(topic || 'icerik').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'icerik') + `-${String(i + 1).padStart(2, '0')}.png`;

// "*altın*" işaretli metni parçalara ayır: [{t, gold}]
export function richTokens(text) {
  const out = [];
  String(text || '').split(/(\*[^*]+\*)/).forEach(part => {
    if (!part) return;
    const gold = /^\*[^*]+\*$/.test(part);
    for (const w of part.replace(/\*/g, '').split(/(\s+)/)) if (w && !/^\s+$/.test(w)) out.push({ t: w, gold });
  });
  return out;
}
// Kelimeleri satırlara dağıt (measure: metin genişliği)
export function wrapTokens(tokens, measure, maxW) {
  const lines = []; let line = [];
  const width = ws => measure(ws.map(x => x.t).join(' '));
  for (const tk of tokens) {
    if (line.length && width([...line, tk]) > maxW) { lines.push(line); line = [tk]; } else line.push(tk);
  }
  if (line.length) lines.push(line);
  return lines;
}

// ====================================================================
// Çizim
const GOLD = '#D9AE4E', GOLD_L = '#F3D58A', GOLD_D = '#A9802F', NAVY = '#0E1C3D', NAVY_D = '#081330', CREAM = '#F6EBD0', INK = '#152645';
export const SERIF = '"Playfair Display", "DM Serif Display", Georgia, serif';
export const SANS = '"DM Sans", Montserrat, sans-serif';

function rr(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function goldGrad(c, x, y, w, h) {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, GOLD_L); g.addColorStop(0.5, GOLD); g.addColorStop(1, GOLD_D); return g;
}
function bokeh(c, seed) {
  let s = seed * 7919 + 13; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  c.save();
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H * 0.75, r = 6 + rnd() * 30, a = 0.04 + rnd() * 0.12;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(243,213,138,${a})`); g.addColorStop(1, 'rgba(243,213,138,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
function drawBackground(c, idx) {
  const g = c.createRadialGradient(W * 0.6, H * 0.28, 60, W * 0.5, H * 0.5, H * 0.85);
  g.addColorStop(0, '#22386A'); g.addColorStop(0.45, NAVY); g.addColorStop(1, NAVY_D);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  bokeh(c, idx + 1);
}
function drawFrame(c) {
  c.save();
  c.lineWidth = 5; c.strokeStyle = goldGrad(c, 0, 0, W, H);
  rr(c, 16, 16, W - 32, H - 32, 44); c.stroke();
  c.restore();
}
// Fotoğraf: sol üst köşe, sağa ve aşağı doğru erir
function drawPhoto(c, img) {
  const pw = 470, ph = 520;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw) return false;
  const off = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(pw, ph) : Object.assign(document.createElement('canvas'), { width: pw, height: ph });
  const o = off.getContext('2d');
  const sc = Math.max(pw / iw, ph / ih), dw = iw * sc, dh = ih * sc;
  o.drawImage(img, (pw - dw) / 2, Math.min(0, (ph - dh) * 0.2), dw, dh);
  o.globalCompositeOperation = 'destination-in';
  const gx = o.createLinearGradient(0, 0, pw, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.62, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gx; o.fillRect(0, 0, pw, ph);
  const gy = o.createLinearGradient(0, 0, 0, ph); gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(0.6, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gy; o.fillRect(0, 0, pw, ph);
  c.save(); rr(c, 16, 16, W - 32, H - 32, 44); c.clip(); c.drawImage(off, 16, 16); c.restore();
  return true;
}
function badge(c, text, cx, y) {
  if (!text) return y;
  c.font = `italic 700 40px ${SERIF}`;
  const w = Math.min(760, c.measureText(text).width + 110), h = 66;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 16;
  c.fillStyle = goldGrad(c, 0, y, 0, h);
  c.beginPath(); c.moveTo(cx - w / 2 + 26, y); c.lineTo(cx + w / 2 - 26, y); c.lineTo(cx + w / 2, y + h / 2); c.lineTo(cx + w / 2 - 26, y + h);
  c.lineTo(cx - w / 2 + 26, y + h); c.lineTo(cx - w / 2, y + h / 2); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  fitLine(c, text, cx, y + h / 2 + 2, w - 70, `italic 700 {s}px ${SERIF}`, 40);
  return y + h;
}
function fitLine(c, text, x, y, maxW, fontTpl, size) {
  let s = size; c.font = fontTpl.replace('{s}', s);
  while (c.measureText(text).width > maxW && s > 18) { s -= 2; c.font = fontTpl.replace('{s}', s); }
  c.fillText(text, x, y);
}
// Zengin metin: satır satır, ortalı ya da sola dayalı. Döner: biten y
function rich(c, text, { x, y, maxW, size, font, lh = 1.18, align = 'center', color = '#fff', gold = GOLD_L, maxLines = 4, minSize = 22, shadow = true }) {
  const toks = richTokens(text);
  if (!toks.length) return y;
  let s = size, lines;
  for (;;) {
    c.font = font.replace('{s}', s);
    lines = wrapTokens(toks, t => c.measureText(t).width, maxW);
    if (lines.length <= maxLines || s <= minSize) break;
    s -= 2;
  }
  lines = lines.slice(0, maxLines);
  c.textBaseline = 'top'; c.textAlign = 'left';
  if (shadow) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 12; }
  const sp = c.measureText(' ').width;
  lines.forEach((ln, i) => {
    const lw = c.measureText(ln.map(t => t.t).join(' ')).width;
    let cx = align === 'center' ? x - lw / 2 : x;
    for (const tk of ln) { c.fillStyle = tk.gold ? gold : color; c.fillText(tk.t, cx, y + i * s * lh); cx += c.measureText(tk.t).width + sp; }
  });
  c.shadowBlur = 0;
  return y + lines.length * s * lh;
}
function divider(c, cx, y, w) {
  c.save();
  const g = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, 'rgba(217,174,78,0)'); g.addColorStop(0.5, GOLD); g.addColorStop(1, 'rgba(217,174,78,0)');
  c.fillStyle = g; c.fillRect(cx - w / 2, y, w, 3);
  c.fillStyle = GOLD_L; c.translate(cx, y + 1.5); c.rotate(Math.PI / 4); c.fillRect(-7, -7, 14, 14);
  c.restore();
}
function ribbon(c, text, cx, y, w) {
  if (!text) return y;
  c.font = `italic 700 32px ${SERIF}`;
  const lines = wrapTokens(richTokens(text), t => c.measureText(t).width, w - 90).slice(0, 2);
  const h = 36 + lines.length * 40;
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 14;
  c.fillStyle = goldGrad(c, 0, y, 0, h); rr(c, cx - w / 2, y, w, h, h / 2); c.fill(); c.restore();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'top';
  lines.forEach((ln, i) => c.fillText(ln.map(t => t.t).join(' '), cx, y + 18 + i * 40));
  return y + h;
}
// Çizmeden yükseklik ölç (dikey ortalama için)
function textH(c, text, maxW, size, font, lh, maxLines) {
  if (!text) return 0;
  c.font = font.replace('{s}', size);
  return Math.min(maxLines, wrapTokens(richTokens(text), t => c.measureText(t).width, maxW).length) * size * lh;
}
function bodyH(c, text, w, size, maxLines) { return textH(c, text, w - 24, size, `500 {s}px ${SANS}`, 1.34, maxLines); }
// Boşluğa göre paragraf boyutu: kısa metin büyük yazılır
function bodySize(c, text, w, avail, base) {
  for (const sz of [base + 6, base + 3, base]) if (bodyH(c, text, w, sz, 20) <= avail * 0.62) return sz;
  return base;
}

function bodyBlock(c, text, x, y, w, maxLines = 7, size = 33) {
  if (!text) return y;
  c.font = `500 ${size}px ${SANS}`;
  const end = rich(c, text, { x: x + 24, y, maxW: w - 24, size, font: `500 {s}px ${SANS}`, lh: 1.34, align: 'left', color: '#EEF1F8', maxLines, minSize: 24 });
  c.fillStyle = goldGrad(c, 0, y, 0, end - y); c.fillRect(x, y + 4, 5, end - y - 8);
  return end;
}
function quoteBar(c, text) {
  if (!text) return;
  const x = 70, y = 1064, w = W - 140, h = 140;
  c.save(); c.fillStyle = 'rgba(8,19,48,.82)'; rr(c, x, y, w, h, 30); c.fill();
  c.lineWidth = 3; c.strokeStyle = goldGrad(c, 0, y, 0, h); rr(c, x, y, w, h, 30); c.stroke(); c.restore();
  const cx = x + 82, cy = y + h / 2;
  c.fillStyle = goldGrad(c, 0, cy - 46, 0, 92); c.beginPath(); c.arc(cx, cy, 46, 0, Math.PI * 2); c.fill();
  c.fillStyle = INK; c.font = `900 88px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('“', cx + 2, cy + 22);
  c.fillStyle = GOLD; c.fillRect(x + 150, y + 30, 3, h - 60);
  const tx = x + 180, tw = w - 210;
  c.font = `italic 700 44px ${SERIF}`;
  const lines = wrapTokens(richTokens(text), t => c.measureText(t).width, tw).length;
  const size = lines > 2 ? 36 : 44;
  const nl = Math.min(3, lines > 2 ? wrapTokens(richTokens(text), t => { c.font = `italic 700 36px ${SERIF}`; return c.measureText(t).width; }, tw).length : lines);
  rich(c, text, { x: tx + tw / 2, y: cy - (nl * size * 1.12) / 2, maxW: tw, size, font: `italic 700 {s}px ${SERIF}`, lh: 1.12, align: 'center', maxLines: 3, minSize: 28 });
}

// Simgeler (altın çizgi, hafif parıltı)
export function drawEmblem(c, kind, cx, cy, r) {
  c.save();
  c.strokeStyle = GOLD_L; c.fillStyle = GOLD_L; c.lineWidth = Math.max(4, r * 0.07); c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = 'rgba(243,213,138,.75)'; c.shadowBlur = r * 0.35;
  const bubble = (x, y, rr2) => { c.beginPath(); c.arc(x, y, rr2, Math.PI * 0.62, Math.PI * 2.38); c.lineTo(x - rr2 * 0.9, y + rr2 * 1.15); c.closePath(); c.stroke(); };
  if (kind === 'soru') {
    bubble(cx, cy, r * 0.8);
    c.font = `900 ${r * 1.05}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', cx, cy + r * 0.05);
  } else if (kind === 'hedef') {
    for (const k of [0.95, 0.65, 0.35]) { c.beginPath(); c.arc(cx, cy, r * k, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.arc(cx, cy, r * 0.1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + r * 0.95, cy - r * 0.95); c.stroke();
    c.beginPath(); c.moveTo(cx + r * 0.95, cy - r * 0.95); c.lineTo(cx + r * 0.6, cy - r * 0.95); c.moveTo(cx + r * 0.95, cy - r * 0.95); c.lineTo(cx + r * 0.95, cy - r * 0.6); c.stroke();
  } else if (kind === 'kalp') {
    c.beginPath(); c.moveTo(cx, cy + r * 0.75);
    c.bezierCurveTo(cx - r * 1.3, cy - r * 0.05, cx - r * 0.55, cy - r * 0.95, cx, cy - r * 0.35);
    c.bezierCurveTo(cx + r * 0.55, cy - r * 0.95, cx + r * 1.3, cy - r * 0.05, cx, cy + r * 0.75); c.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.42; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 1.05, cy - r * 0.1 + Math.sin(a) * r * 1.05); c.lineTo(cx + Math.cos(a) * r * 1.3, cy - r * 0.1 + Math.sin(a) * r * 1.3); c.stroke(); }
  } else if (kind === 'sohbet') {
    bubble(cx - r * 0.35, cy - r * 0.15, r * 0.55);
    c.beginPath(); c.arc(cx + r * 0.42, cy + r * 0.2, r * 0.5, Math.PI * 0.95, Math.PI * 2.75); c.lineTo(cx + r * 1.0, cy + r * 0.85); c.closePath(); c.stroke();
    c.font = `900 ${r * 0.6}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', cx - r * 0.35, cy - r * 0.12);
    for (const k of [-1, 0, 1]) { c.beginPath(); c.arc(cx + r * 0.42 + k * r * 0.17, cy + r * 0.2, r * 0.05, 0, Math.PI * 2); c.fill(); }
  } else if (kind === 'zirve') {
    c.beginPath(); c.moveTo(cx - r, cy + r * 0.7); c.lineTo(cx - r * 0.25, cy - r * 0.45); c.lineTo(cx + r * 0.1, cy + r * 0.05);
    c.lineTo(cx + r * 0.45, cy - r * 0.25); c.lineTo(cx + r, cy + r * 0.7); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(cx - r * 0.25, cy - r * 0.45); c.lineTo(cx - r * 0.25, cy - r * 1.0); c.lineTo(cx + r * 0.2, cy - r * 0.85); c.lineTo(cx - r * 0.25, cy - r * 0.7); c.stroke();
    c.beginPath(); c.arc(cx + r * 0.7, cy - r * 0.75, r * 0.2, 0, Math.PI * 2); c.stroke();
  } else if (kind === 'kum') {
    c.beginPath(); c.moveTo(cx - r * 0.6, cy - r); c.lineTo(cx + r * 0.6, cy - r); c.moveTo(cx - r * 0.6, cy + r); c.lineTo(cx + r * 0.6, cy + r); c.stroke();
    c.beginPath(); c.moveTo(cx - r * 0.48, cy - r); c.quadraticCurveTo(cx - r * 0.45, cy - r * 0.2, cx, cy); c.quadraticCurveTo(cx - r * 0.45, cy + r * 0.2, cx - r * 0.48, cy + r);
    c.moveTo(cx + r * 0.48, cy - r); c.quadraticCurveTo(cx + r * 0.45, cy - r * 0.2, cx, cy); c.quadraticCurveTo(cx + r * 0.45, cy + r * 0.2, cx + r * 0.48, cy + r); c.stroke();
    c.beginPath(); c.moveTo(cx - r * 0.3, cy + r * 0.85); c.lineTo(cx, cy + r * 0.5); c.lineTo(cx + r * 0.3, cy + r * 0.85); c.closePath(); c.fill();
  }
  c.restore();
}
function iconCircle(c, cx, cy, r, glyph) {
  c.save(); c.fillStyle = goldGrad(c, 0, cy - r, 0, r * 2); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = INK; c.font = `900 ${r * 1.15}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, cx, cy + r * 0.06); c.restore();
}

// Başlık alanı: rozet + başlık + ayırıcı. Döner: içerik başlangıcı y
function header(c, s, hasPhoto, big = false, top = 52) {
  const left = hasPhoto ? 380 : 80, right = W - 70, cx = (left + right) / 2, w = right - left;
  let y = badge(c, s.badge, hasPhoto ? cx : W / 2, top);
  y += big ? 34 : 26;
  y = rich(c, s.title, { x: cx, y, maxW: w, size: big ? 92 : 80, font: `800 {s}px ${SERIF}`, lh: 1.08, maxLines: 3, minSize: 50 });
  y += 18; divider(c, cx, y, Math.min(w, 620)); y += 30;
  return Math.max(y, hasPhoto ? 470 : y);
}

// Tek sayfa çiz. photo: HTMLImageElement ya da null
export function drawSlide(c, deck, i, photo = null, logo = null) {
  const s = deck.slides[i];
  c.save(); c.clearRect(0, 0, W, H);
  drawBackground(c, i);
  const hasPhoto = !!(photo && drawPhoto(c, photo));
  drawFrame(c);
  const L = s.layout;
  const brandTop = drawTopBrand(c, deck.brand, logo, hasPhoto ? (380 + W - 70) / 2 : W / 2);
  let y = header(c, s, hasPhoto, L === 'kapak' || L === 'kapanis', brandTop);
  const qTop = s.quote ? 1044 : 1196;

  if (L === 'kapak' || L === 'fikir') {
    if (s.ribbon) y = ribbon(c, s.ribbon, W / 2, y, 900) + 30;
    const avail = qTop - 24 - y;
    const em = s.emblem && avail > 260;
    const bw = em ? 600 : W - 170;
    const bs = bodySize(c, s.body, bw, avail, L === 'kapak' ? 32 : 34);
    const maxL = Math.floor((avail - 10) / (bs * 1.34));
    const bh = Math.max(bodyH(c, s.body, bw, bs, maxL), em ? 280 : 0);
    const y0 = y + Math.max(0, (avail - bh) / 2);
    const end = bodyBlock(c, s.body, 85, y0 + Math.max(0, (bh - bodyH(c, s.body, bw, bs, maxL)) / 2), bw, maxL, bs);
    if (em) drawEmblem(c, s.emblem, 85 + bw + (W - 85 - bw - 60) / 2, y0 + bh / 2, 125);
    void end;
  } else if (L === 'uclu') {
    const bw = s.emblem ? 600 : W - 170;
    const bh = Math.max(bodyH(c, s.body, bw, 31, 6), s.emblem ? 230 : 0);
    const boxH = 220, gap = s.body || s.emblem ? 40 : 0;
    const avail = qTop - 24 - y;
    y += Math.max(0, (avail - bh - gap - boxH) / 2);
    if (s.body) bodyBlock(c, s.body, 85, y + Math.max(0, (bh - bodyH(c, s.body, bw, 31, 6)) / 2), bw, 6, 31);
    if (s.emblem) drawEmblem(c, s.emblem, 880, y + bh / 2, 105);
    const by = y + bh + gap, bhh = Math.min(boxH, qTop - by - 24);
    if (bhh > 120) {
      c.save(); c.fillStyle = 'rgba(8,19,48,.75)'; rr(c, 70, by, W - 140, bhh, 26); c.fill();
      c.lineWidth = 2.5; c.strokeStyle = GOLD; rr(c, 70, by, W - 140, bhh, 26); c.stroke(); c.restore();
      const n = s.items.length, cw = (W - 140) / n;
      s.items.forEach((it, k) => {
        const x0 = 70 + k * cw;
        if (k) { c.fillStyle = 'rgba(217,174,78,.6)'; c.fillRect(x0, by + 24, 2, bhh - 48); }
        drawEmblem(c, ['kalp', 'sohbet', 'hedef'][k % 3], x0 + 62, by + bhh / 2, 34);
        const lh1 = textH(c, it.label, cw - 128, 30, `italic 700 {s}px ${SERIF}`, 1.1, 2), lh2 = textH(c, it.text, cw - 128, 26, `500 {s}px ${SANS}`, 1.2, 3);
        const ty0 = by + (bhh - lh1 - lh2 - 6) / 2;
        const ty = rich(c, it.label, { x: x0 + 112, y: ty0, maxW: cw - 128, size: 30, font: `italic 700 {s}px ${SERIF}`, align: 'left', maxLines: 2, minSize: 22, lh: 1.1 });
        rich(c, it.text, { x: x0 + 112, y: ty + 6, maxW: cw - 128, size: 26, font: `500 {s}px ${SANS}`, align: 'left', color: '#DCE3F2', maxLines: 3, minSize: 20, lh: 1.2 });
      });
    }
  } else if (L === 'liste') {
    if (s.ribbon) y = ribbon(c, s.ribbon, W / 2, y, 900) + 26;
    else if (s.body) y = bodyBlock(c, s.body, 85, y + 6, W - 170, 4, 30) + 24;
    const n = s.items.length, gap = 18, rh = Math.min(150, (qTop - y - 20 - gap * (n - 1)) / n);
    y += Math.max(0, (qTop - 24 - y - (n * rh + gap * (n - 1))) / 2);
    s.items.forEach((it, k) => {
      const ry = y + k * (rh + gap);
      const hasLabel = !!it.label, lw = hasLabel ? 270 : 0;
      c.save(); c.lineWidth = 2.5; c.strokeStyle = GOLD;
      if (hasLabel) { c.fillStyle = 'rgba(8,19,48,.85)'; rr(c, 70, ry, lw, rh, 18); c.fill(); c.stroke(); }
      c.fillStyle = CREAM; rr(c, 70 + lw + (hasLabel ? 10 : 0), ry, W - 140 - lw - (hasLabel ? 10 : 0), rh, 18); c.fill(); c.stroke(); c.restore();
      if (hasLabel) {
        rich(c, it.label, { x: 70 + lw / 2, y: ry + rh / 2 - 22, maxW: lw - 30, size: 38, font: `italic 800 {s}px ${SERIF}`, maxLines: 2, minSize: 24, lh: 1.0, color: GOLD_L });
      }
      const qx = 70 + lw + (hasLabel ? 10 : 0) + 56;
      iconCircle(c, qx, ry + rh / 2, 30, '?');
      const tw = W - 70 - (qx + 44) - 20;
      c.font = `italic 600 30px ${SERIF}`;
      const nl = Math.min(3, wrapTokens(richTokens(it.text), t => c.measureText(t).width, tw).length);
      rich(c, it.text, { x: qx + 44, y: ry + rh / 2 - (nl * 30 * 1.16) / 2, maxW: tw, size: 30, font: `italic 600 {s}px ${SERIF}`, align: 'left', color: INK, gold: GOLD_D, maxLines: 3, minSize: 22, lh: 1.16, shadow: false });
    });
  } else if (L === 'adim') {
    const bw = s.emblem ? 640 : W - 170;
    const bh = s.body ? Math.max(bodyH(c, s.body, bw, 30, 5), s.emblem ? 190 : 0) : 0;
    const n = s.items.length, gap = 26, cw = (W - 140 - gap * (n - 1)) / n;
    const tl = Math.max(1, ...s.items.map(it => textH(c, it.text, cw - 36, 28, `600 {s}px ${SANS}`, 1.25, 6)));
    const avail = qTop - 24 - y;
    let chh = Math.min(Math.max(220, 120 + tl + 30), avail - bh - (bh ? 40 : 0));
    y += Math.max(0, (avail - bh - (bh ? 40 : 0) - chh) / 2);
    if (s.body) bodyBlock(c, s.body, 85, y + Math.max(0, (bh - bodyH(c, s.body, bw, 30, 5)) / 2), bw, 5, 30);
    if (s.emblem && s.body) drawEmblem(c, s.emblem, 900, y + bh / 2, 90);
    const cy0 = y + bh + (bh ? 40 : 0);
    s.items.forEach((it, k) => {
      const x0 = 70 + k * (cw + gap);
      c.save(); c.fillStyle = CREAM; rr(c, x0, cy0, cw, chh, 20); c.fill(); c.lineWidth = 2.5; c.strokeStyle = GOLD; rr(c, x0, cy0, cw, chh, 20); c.stroke();
      c.fillStyle = 'rgba(8,19,48,.92)'; rr(c, x0, cy0, cw, 74, 20); c.fill(); c.restore();
      iconCircle(c, x0 + 44, cy0 + 37, 26, String(k + 1));
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      fitLine(c, it.label || `Adım ${k + 1}`, x0 + 82, cy0 + 39, cw - 96, `italic 800 {s}px ${SERIF}`, 34);
      const th = textH(c, it.text, cw - 36, 28, `600 {s}px ${SANS}`, 1.25, 6);
      rich(c, it.text, { x: x0 + cw / 2, y: cy0 + 74 + Math.max(20, (chh - 74 - th) / 2), maxW: cw - 36, size: 28, font: `600 {s}px ${SANS}`, color: INK, gold: GOLD_D, maxLines: Math.floor((chh - 110) / 35), minSize: 20, lh: 1.25, shadow: false });
      if (k < n - 1) { c.fillStyle = GOLD_L; c.beginPath(); const ax = x0 + cw + gap / 2, ay = cy0 + chh / 2; c.moveTo(ax - 7, ay - 11); c.lineTo(ax + 8, ay); c.lineTo(ax - 7, ay + 11); c.fill(); }
    });
  } else if (L === 'kapanis') {
    const nRows = [deck.brand.web, deck.brand.wa, deck.brand.handle].filter(Boolean).length;
    const need = 66 + 16 + (deck.brand.follow ? 80 : 0) + nRows * 76;
    const em = s.emblem && (qTop - y - need) > 230;
    const end = bodyBlock(c, s.body, 85, y + 6, em ? 600 : W - 170, 5, 32);
    if (em) drawEmblem(c, s.emblem, 880, y + 100, 90);
    let fy = Math.max(end, em ? y + 200 : end) + 26;
    fy += Math.max(0, (qTop - 20 - fy - need) / 2);
    fy = ribbon(c, 'Bizi takip edin', W / 2, fy, 440) + 16;
    const b = deck.brand;
    if (b.follow) fy = rich(c, b.follow, { x: W / 2, y: fy, maxW: 880, size: 27, font: `500 {s}px ${SANS}`, maxLines: 2, minSize: 20, color: '#E6EBF5', lh: 1.25 }) + 16;
    const rows = [['web', b.web], ['wa', b.wa], ['ig', b.handle]].filter(r => r[1]);
    rows.forEach(([kind, val]) => {
      if (fy + 70 > qTop - 10) return;
      c.save(); c.fillStyle = 'rgba(8,19,48,.7)'; rr(c, 150, fy, W - 300, 64, 32); c.fill(); c.lineWidth = 2; c.strokeStyle = GOLD; rr(c, 150, fy, W - 300, 64, 32); c.stroke(); c.restore();
      contactIcon(c, kind, 196, fy + 32);
      c.fillStyle = GOLD; c.fillRect(234, fy + 14, 2, 36);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      fitLine(c, val, 256, fy + 33, W - 300 - 130, kind === 'wa' ? `500 {s}px ${SANS}` : `italic 700 {s}px ${SERIF}`, kind === 'wa' ? 24 : 32);
      fy += 76;
    });
  }
  quoteBar(c, s.quote);
  drawFooter(c, deck, i, logo);
  c.restore();
}

// Logo + ad yazısı (üst bant). Döner: rozetin başlayacağı y
function logoMark(c, logo, name, cx, cy, h, gold = true) {
  const lw = logo ? (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height) * h : 0;
  const parts = String(name || '').toLocaleUpperCase('tr-TR').split(/\s+/).filter(Boolean);
  const l1 = parts.slice(0, Math.ceil(parts.length / 2)).join(' '), l2 = parts.slice(Math.ceil(parts.length / 2)).join(' ');
  const fs = Math.round(h * 0.36);
  c.font = `700 ${fs}px ${SERIF}`;
  const tw = name ? Math.max(c.measureText(l1).width, c.measureText(l2).width) + (l1.length + 2) * fs * 0.08 : 0;
  const gap = logo && name ? h * 0.32 : 0;
  const total = lw + (gap ? gap * 2 + 3 : 0) + tw;
  let x = cx - total / 2;
  if (logo) { c.drawImage(logo, x, cy - h / 2, lw, h); x += lw; }
  if (gap) { x += gap; c.fillStyle = gold ? GOLD : '#fff'; c.fillRect(x, cy - h * 0.38, 3, h * 0.76); x += 3 + gap; }
  if (name) {
    c.fillStyle = goldGrad(c, 0, cy - h / 2, 0, h); c.textAlign = 'left'; c.textBaseline = 'middle';
    c.letterSpacing = `${Math.round(fs * 0.14)}px`;
    if (l2) { c.fillText(l1, x, cy - fs * 0.58); c.fillText(l2, x, cy + fs * 0.62); } else c.fillText(l1, x, cy);
    c.letterSpacing = '0px';
  }
  return { left: cx - total / 2, right: cx + total / 2 };
}
function drawTopBrand(c, b, logo, cx) {
  if (!logo && !b.name) return 52;
  const cy = 92, h = 84;
  const r = logoMark(c, logo, b.name, cx, cy, h);
  // iki yanda altın çizgiler
  for (const [a, z] of [[Math.max(60, cx - 420), r.left - 26], [r.right + 26, Math.min(W - 60, cx + 420)]]) {
    if (z - a < 30) continue;
    const g = c.createLinearGradient(a, 0, z, 0);
    const toIn = a < cx;
    g.addColorStop(0, toIn ? 'rgba(217,174,78,0)' : GOLD); g.addColorStop(1, toIn ? GOLD : 'rgba(217,174,78,0)');
    c.fillStyle = g; c.fillRect(a, cy - 1.5, z - a, 3);
  }
  return cy + h / 2 + 30;
}
// Alt bant: logo | web | "Kaydırarak devam et →" (son sayfada hesap adı)
function drawFooter(c, deck, i, logo) {
  const b = deck.brand, last = i === deck.slides.length - 1;
  const y = 1226, h = 76, cy = y + h / 2 + 8;
  const g = c.createLinearGradient(70, 0, W - 70, 0);
  g.addColorStop(0, 'rgba(217,174,78,0)'); g.addColorStop(0.5, GOLD); g.addColorStop(1, 'rgba(217,174,78,0)');
  c.fillStyle = g; c.fillRect(70, y - 8, W - 140, 2.5);
  const segs = [];
  if (logo || b.name) segs.push({ kind: 'logo', w: 0 });
  if (b.web && !last) segs.push({ kind: 'web', w: 0 });
  if (!last) segs.push({ kind: 'swipe', w: 0 });
  else if (b.handle) segs.push({ kind: 'handle', w: 0 });
  if (!segs.length) return;
  // genişlikleri ölç
  c.font = `600 26px ${SANS}`;
  const webW = b.web ? c.measureText(b.web).width + 92 : 0;
  c.font = `italic 800 30px ${SERIF}`;
  const swW = c.measureText('Kaydırarak devam et').width + 110;
  c.font = `italic 700 30px ${SERIF}`;
  const hdW = b.handle ? c.measureText(b.handle).width + 80 : 0;
  for (const sg of segs) {
    if (sg.kind === 'logo') {
      c.font = `700 22px ${SERIF}`;
      const parts = String(b.name || '').toLocaleUpperCase('tr-TR').split(/\s+/);
      const tw = b.name ? Math.max(...[parts.slice(0, Math.ceil(parts.length / 2)).join(' '), parts.slice(Math.ceil(parts.length / 2)).join(' ')].map(t => c.measureText(t).width)) * 1.2 : 0;
      sg.w = (logo ? (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height) * 62 : 0) + (logo && b.name ? 44 : 0) + tw;
    } else sg.w = { web: webW, swipe: swW, handle: hdW }[sg.kind];
  }
  const gapW = 34, total = segs.reduce((a, x) => a + x.w, 0) + gapW * 2 * (segs.length - 1);
  let scale = Math.min(1, (W - 120) / total);
  let x = (W - total * scale) / 2;
  c.save(); c.translate(x, cy); c.scale(scale, scale);
  let px = 0;
  segs.forEach((sg, k) => {
    if (k) { px += gapW; c.fillStyle = GOLD; c.fillRect(px - 1.5, -26, 3, 52); px += gapW; }
    if (sg.kind === 'logo') { logoMark(c, logo, b.name, px + sg.w / 2, 0, 62); }
    else if (sg.kind === 'web') {
      c.lineWidth = 2.5; c.strokeStyle = GOLD; rr(c, px, -27, sg.w, 54, 27); c.stroke();
      contactIcon(c, 'web', px + 34, 0);
      c.fillStyle = '#fff'; c.font = `600 26px ${SANS}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(b.web, px + 62, 1);
    } else if (sg.kind === 'swipe' || sg.kind === 'handle') {
      c.fillStyle = goldGrad(c, 0, -29, 0, 58); rr(c, px, -29, sg.w, 58, 29); c.fill();
      c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'middle';
      if (sg.kind === 'swipe') {
        c.font = `italic 800 30px ${SERIF}`; c.fillText('Kaydırarak devam et', px + 28, 1);
        const ax = px + sg.w - 62;
        c.strokeStyle = INK; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax + 34, 0); c.moveTo(ax + 22, -12); c.lineTo(ax + 35, 0); c.lineTo(ax + 22, 12); c.stroke();
      } else { c.font = `italic 700 30px ${SERIF}`; c.textAlign = 'center'; c.fillText(b.handle, px + sg.w / 2, 1); }
    }
    px += sg.w;
  });
  c.restore();
}
function contactIcon(c, kind, cx, cy) {
  c.save(); c.strokeStyle = GOLD_L; c.fillStyle = GOLD_L; c.lineWidth = 3;
  if (kind === 'web') {
    c.beginPath(); c.arc(cx, cy, 17, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(cx, cy, 7, 17, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - 17, cy); c.lineTo(cx + 17, cy); c.stroke();
  } else if (kind === 'wa') {
    c.beginPath(); c.arc(cx, cy, 16, Math.PI * 0.7, Math.PI * 2.55); c.lineTo(cx - 17, cy + 17); c.closePath(); c.stroke();
    c.font = `700 18px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('☏', cx, cy + 1);
  } else {
    rr(c, cx - 16, cy - 16, 32, 32, 9); c.stroke(); c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx + 9, cy - 9, 2.2, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

export async function loadDeckFonts() {
  if (!globalThis.document?.fonts?.load) return;
  await Promise.all([`800 80px "Playfair Display"`, `italic 700 40px "Playfair Display"`, `italic 800 34px "Playfair Display"`,
    `italic 600 30px "Playfair Display"`, `500 32px "DM Sans"`, `600 27px "DM Sans"`].map(f => document.fonts.load(f))).catch(() => {});
}

// Tüm sayfaları PNG olarak üret → [{ blob, name }]
export async function renderDeck(deck, photo = null, onProgress = () => {}, logo = null) {
  await loadDeckFonts();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const out = [];
  for (let i = 0; i < deck.slides.length; i++) {
    drawSlide(c, deck, i, photo, logo);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    out.push({ blob, name: deckFileName(deck.topic || deck.slides[0]?.title, i) });
    onProgress((i + 1) / deck.slides.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return out;
}

// Fotoğrafı küçültüp cihazda saklanabilir hale getir (dataURL, ~600px)
export async function shrinkPhoto(file, max = 640) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = () => rej(new Error('Fotoğraf açılamadı.')); m.src = url; });
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}
export async function shrinkLogo(file, max = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = () => rej(new Error('Logo açılamadı.')); m.src = url; });
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
export function imageFromData(dataUrl) {
  return new Promise((res) => { if (!dataUrl) return res(null); const m = new Image(); m.onload = () => res(m); m.onerror = () => res(null); m.src = dataUrl; });
}
