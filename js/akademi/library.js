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
  link: { label: 'Bağlantı', icon: 'ti-link', accept: '' },
  yazi: { label: 'Yazı', icon: 'ti-file-text', accept: '' }
};
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
  if (h === 'drive.google.com') { const m = u.pathname.match(/\/file\/d\/([\w-]+)/); if (m) return `https://drive.google.com/file/d/${m[1]}/preview`; }
  return null;
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
