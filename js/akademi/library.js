// Akademi kütüphanesi: kategoriler, materyal türleri, gömme bağlantıları ve ilerleme hesapları (saf fonksiyonlar).

export const CATEGORIES = [
  { id: 'baslangic', label: 'Yeni başlayanlar', icon: 'ti-rocket', hint: 'İlk gün izlenecekler: sistem, ilk adımlar, uygulamanın kullanımı.' },
  { id: 'urunler', label: 'Ürünler', icon: 'ti-package', hint: 'Ürün tanıtımları, kullanım şekli, sık sorulanlar. Sağlık iddiası içermez.' },
  { id: 'sirket', label: 'Şirket', icon: 'ti-building', hint: 'Şirketin hikâyesi, değerleri, yasal bilgiler, etkinlikler.' },
  { id: 'kazanc', label: 'Kazanç planı', icon: 'ti-chart-arrows-vertical', hint: 'Resmi kazanç planı belgesi ve kariyer basamakları.' },
  { id: 'satis', label: 'Satış ve iletişim', icon: 'ti-message-2', hint: 'Davet, sunum, itiraz, takip.' },
  { id: 'liderlik', label: 'Liderlik', icon: 'ti-users-group', hint: 'Ekip kurma, duplikasyon, motivasyon.' },
  { id: 'gelisim', label: 'Kişisel gelişim', icon: 'ti-brain', hint: 'Kitap özetleri, alışkanlıklar, zaman yönetimi.' },
  { id: 'diger', label: 'Diğer', icon: 'ti-folder', hint: '' }
];
export const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const KINDS = {
  pdf: { label: 'PDF', icon: 'ti-file-type-pdf', accept: 'application/pdf' },
  video: { label: 'Video', icon: 'ti-player-play', accept: 'video/mp4,video/quicktime,video/webm' },
  html: { label: 'HTML sayfa', icon: 'ti-file-code', accept: 'text/html,.html,.htm' },
  gorsel: { label: 'Görsel', icon: 'ti-photo', accept: 'image/jpeg,image/png,image/webp' },
  ses: { label: 'Ses kaydı', icon: 'ti-microphone', accept: 'audio/*,.mp3,.m4a,.wav,.ogg,.webm' },
  belge: { label: 'Word / Excel / PowerPoint', icon: 'ti-file-type-doc', accept: '.doc,.docx,.xls,.xlsx,.ppt,.pptx' },
  drive: { label: 'Google Drive', icon: 'ti-brand-google-drive', accept: '' },
  link: { label: 'Bağlantı', icon: 'ti-link', accept: '' },
  yazi: { label: 'Yazı', icon: 'ti-file-text', accept: '' }
};
export const FILE_KINDS = ['pdf', 'video', 'html', 'gorsel', 'ses', 'belge'];
export const URL_KINDS = ['link', 'drive'];

export const FOLDER_COLORS = { gold: 'Altın', navy: 'Lacivert', green: 'Yeşil', blue: 'Mavi', purple: 'Mor', red: 'Kırmızı', gray: 'Gri' };
// İlk açılışta oluşturulan ana klasörler (kategorilerden)
export const DEFAULT_FOLDERS = [
  { name: 'Yeni başlayanlar', category: 'baslangic', color: 'gold', sort: 10 },
  { name: 'Ürünler', category: 'urunler', color: 'green', sort: 20 },
  { name: 'Şirket', category: 'sirket', color: 'navy', sort: 30 },
  { name: 'Kazanç planı', category: 'kazanc', color: 'purple', sort: 40 },
  { name: 'Satış ve iletişim', category: 'satis', color: 'blue', sort: 50 },
  { name: 'Liderlik', category: 'liderlik', color: 'red', sort: 60 },
  { name: 'Kişisel gelişim', category: 'gelisim', color: 'gray', sort: 70 }
];
export const LEVELS = { baslangic: 'Başlangıç', orta: 'Orta', ileri: 'İleri' };

export const DISCLAIMERS = {
  kazanc: 'Bu bölümdeki belgeler şirketin resmi kazanç planını anlatır; gelir garantisi değildir. Sonuçlar kişinin emeğine, zamanına ve becerisine göre değişir. Adaylarla paylaşırken rakam vaadi yapma, belgeyi olduğu gibi göster.',
  urunler: 'Ürünler ilaç değildir; hastalık teşhisi, tedavisi ya da önlenmesi için kullanılmaz. Anlatırken kendi kullanım deneyimini paylaş, sağlık iddiasında bulunma.'
};

export const progressId = id => `lib:${id}`;

// Dosya türünden materyal türü
export function kindFromFile(file) {
  const t = String(file?.type || ''), n = String(file?.name || '').toLowerCase();
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('video/')) return 'video';
  if (t === 'text/html' || /\.html?$/.test(n)) return 'html';
  if (t.startsWith('image/')) return 'gorsel';
  if (t.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac)$/.test(n)) return 'ses';
  if (/\.(docx?|xlsx?|pptx?)$/.test(n) || /msword|officedocument|ms-excel|ms-powerpoint/.test(t)) return 'belge';
  return null;
}

// YouTube / Vimeo / Google Drive bağlantısından gömülebilir adres
export function embedUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1).split('/')[0]}`;
  if (h === 'youtube.com') {
    if (u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  }
  if (h === 'vimeo.com') { const m = u.pathname.match(/^\/(\d+)/); if (m) return `https://player.vimeo.com/video/${m[1]}`; }
  const d = driveInfo(url);
  if (d) return d.embed;
  if (h === 'open.spotify.com') { const m = u.pathname.match(/^\/(episode|track|show|playlist)\/(\w+)/); if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`; }
  return null;
}

// Google Drive / Dokümanlar bağlantısını çöz: dosya, doküman, tablo, sunum, form ya da klasör
export function driveInfo(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname.replace(/^www\./, '');
  if (h === 'drive.google.com') {
    let m = u.pathname.match(/\/file\/d\/([\w-]+)/) || (u.pathname === '/open' && u.searchParams.get('id') && [0, u.searchParams.get('id')]);
    if (m) return { type: 'file', id: m[1], embed: `https://drive.google.com/file/d/${m[1]}/preview`, open: `https://drive.google.com/file/d/${m[1]}/view` };
    m = u.pathname.match(/\/folders\/([\w-]+)/);
    if (m) return { type: 'folder', id: m[1], embed: `https://drive.google.com/embeddedfolderview?id=${m[1]}#list`, open: `https://drive.google.com/drive/folders/${m[1]}` };
  }
  if (h === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([\w-]+)/);
    if (m) {
      const type = { document: 'doc', spreadsheets: 'sheet', presentation: 'slide', forms: 'form' }[m[1]];
      const base = `https://docs.google.com/${m[1]}/d/${m[2] || ''}${m[3]}`;
      const embed = type === 'slide' ? `${base}/embed` : type === 'form' ? `${base}/viewform?embedded=true` : `${base}/preview`;
      return { type, id: m[3], embed, open: type === 'form' ? `${base}/viewform` : `${base}/edit` };
    }
  }
  return null;
}

// Klasör ağacı yardımcıları
export function childrenOf(folders, parentId = null) {
  return folders.filter(f => (f.parent_id || null) === (parentId || null)).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name, 'tr'));
}
export function folderPath(folders, id) {
  const out = []; let cur = folders.find(f => f.id === id), guard = 0;
  while (cur && guard++ < 20) { out.unshift(cur); cur = folders.find(f => f.id === cur.parent_id); }
  return out;
}
export function descendantIds(folders, id) {
  const out = new Set([id]); let added = true;
  while (added) { added = false; for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); added = true; } }
  return out;
}
// Seçim kutusu için girintili liste
export function flatTree(folders, parentId = null, depth = 0, out = []) {
  for (const f of childrenOf(folders, parentId)) { out.push({ ...f, depth }); flatTree(folders, f.id, depth + 1, out); }
  return out;
}
// Klasörün (alt klasörler dahil) materyal sayısı ve tamamlanan
export function folderStats(folders, items, id, done = new Set()) {
  const ids = descendantIds(folders, id);
  const list = items.filter(x => x.folder_id && ids.has(x.folder_id));
  return { items: list.length, done: list.filter(x => done.has(progressId(x.id))).length, sub: childrenOf(folders, id).length };
}
export const rootCategory = (folders, id) => folderPath(folders, id)[0]?.category || 'diger';

// Dosya uzantısından doğru içerik türü (tarayıcıda / ofis uygulamasında doğru açılsın)
const EXT_MIME = { pdf: 'application/pdf', html: 'text/html', htm: 'text/html', txt: 'text/plain', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export function mimeOf(name, fallback = 'application/octet-stream') {
  const ext = String(name || '').toLowerCase().split('.').pop();
  return EXT_MIME[ext] || fallback;
}

// Yazı materyalini bağımsız, okunur bir HTML belgesine çevir (tarayıcıda aç / Word'e indir)
export function textDocHtml(title, body, esc) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1b2a4a}h1{font-size:28px;border-bottom:3px solid #c9a24a;padding-bottom:8px}h3{margin-top:28px}li{margin:4px 0}</style>
</head><body><h1>${esc(title)}</h1>${renderText(body, esc)}</body></html>`;
}

// Liste sıralaması: zorunlu önce, sonra seviye, sıra numarası, başlık
const LV = { baslangic: 0, orta: 1, ileri: 2 };
export function sortItems(items) {
  return [...items].sort((a, b) => (b.required - a.required) || (LV[a.level] - LV[b.level]) || (a.sort - b.sort) || a.title.localeCompare(b.title, 'tr'));
}

// Zorunlu öğrenme yolu: sıra + durum
export function requiredPath(items, done) {
  const list = sortItems(items.filter(x => x.required && x.published !== false));
  const doneN = list.filter(x => done.has(progressId(x.id))).length;
  return { list, done: doneN, total: list.length, next: list.find(x => !done.has(progressId(x.id))) || null, pct: list.length ? Math.round(doneN / list.length * 100) : 0 };
}

export function filterItems(items, { category = '', q = '' } = {}) {
  const n = s => String(s || '').toLocaleLowerCase('tr');
  const qq = n(q).trim();
  return sortItems(items.filter(x => (!category || x.category === category)
    && (!qq || n(x.title).includes(qq) || n(x.summary).includes(qq) || n(x.body).includes(qq))));
}

// Quiz: [{q, o:[..], a}] doğrulama
export function normalizeQuiz(raw) {
  if (!Array.isArray(raw)) return null;
  const out = raw.slice(0, 10).map(x => ({
    q: String(x?.q || '').trim().slice(0, 300),
    o: (Array.isArray(x?.o) ? x.o : []).map(o => String(o || '').trim().slice(0, 200)).filter(Boolean).slice(0, 5),
    a: Number.isInteger(x?.a) ? x.a : -1
  })).filter(x => x.q && x.o.length >= 2 && x.a >= 0 && x.a < x.o.length);
  return out.length ? out : null;
}
export function scoreQuiz(quiz, answers) {
  const right = quiz.filter((x, i) => answers[i] === x.a).length;
  return { right, total: quiz.length, score: Math.round(right / quiz.length * 100) };
}

export function aiQuizPrompt(item, text) {
  return `Aşağıdaki eğitim materyalinden 4 soruluk çoktan seçmeli bir quiz hazırla. Sorular materyali gerçekten anlayıp anlamadığını ölçsün; ezber değil.
Kurallar: her soruda 3 seçenek, tek doğru cevap. Kazanç rakamı ya da sağlık iddiası içeren soru sorma.
Başlık: ${item.title}
Metin:
${String(text || '').slice(0, 8000)}
Sadece JSON döndür: {"quiz":[{"q":"soru","o":["a","b","c"],"a":0}]}`;
}

// Basit yazı biçimi: boş satır = paragraf, "- " = madde, "## " = ara başlık (HTML kaçışı esc ile yapılır)
export function renderText(body, esc) {
  return String(body || '').replace(/\r/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map(l => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (/^##\s+/.test(block)) return `<h3>${esc(block.replace(/^##\s+/, ''))}</h3>`;
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  }).join('');
}

// Elle quiz yazımı: sorular boş satırla ayrılır; ilk satır soru, "*" ile başlayan seçenek doğru, "-" ile başlayanlar yanlış
export function parseQuizText(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return normalizeQuiz(blocks.map(b => {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const q = lines[0].replace(/^\d+[.)]\s*/, '');
    const opts = lines.slice(1).filter(l => /^[*-]\s*/.test(l));
    return { q, o: opts.map(l => l.replace(/^[*-]\s*/, '')), a: opts.findIndex(l => l.startsWith('*')) };
  })) || null;
}
export function quizToText(quiz) {
  return (quiz || []).map(x => [x.q, ...x.o.map((o, i) => `${i === x.a ? '*' : '-'} ${o}`)].join('\n')).join('\n\n');
}
