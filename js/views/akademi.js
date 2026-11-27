// Akademi: Kütüphane (liderlerin eklediği PDF, video, HTML, bağlantı, yazı), İlk 14 gün, 90 günlük program, rozetler, yönetim
import { supabase, fetchAll } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { FIRST_14, MODULES, LESSONS, lessonById, PASS_RATIO } from '../akademi/content.js';
import { earnedBadges, programDay } from '../akademi/badges.js';
import { dailyMetrics, activeStreak } from '../olcum/metrics.js';
import { CATEGORIES, catById, KINDS, LEVELS, DISCLAIMERS, progressId, kindFromFile, embedUrl, requiredPath, filterItems, sortItems,
  normalizeQuiz, scoreQuiz, aiQuizPrompt, renderText, parseQuizText, quizToText } from '../akademi/library.js';
import { aiChat, aiAvailable, extractJSON } from '../ai/client.js';

const TABS = [
  { id: 'kutuphane', label: 'Kütüphane', icon: 'ti-books' },
  { id: 'baslangic', label: 'İlk 14 gün', icon: 'ti-rocket' },
  { id: 'program', label: '90 gün programı', icon: 'ti-school' },
  { id: 'rozet', label: 'Rozetler', icon: 'ti-award' },
  { id: 'yonetim', label: 'Yönetim', icon: 'ti-settings', lead: true }
];
const isLead = () => ['owner', 'leader'].includes(ctx.membership?.role);
let el, ctx, s;

export async function renderAkademi(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  s = { tab: TABS.some(t => t.id === tab && (!t.lead || isLead())) ? tab : 'kutuphane', progress: new Map(), items: [], cat: '', q: '', team: null };

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Ekip ve sistem</div><h1>Akademi</h1><p class="muted" id="a-sub">Yükleniyor…</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="Akademi sekmeleri">
      ${TABS.filter(t => !t.lead || isLead()).map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="a-body"></div>
    <dialog id="a-dialog" class="sheet lesson-sheet" aria-labelledby="a-dialog-title"></dialog>`;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', onInput);

  const [{ data, error }, items] = await Promise.all([
    supabase.from('academy_progress').select('*'),
    supabase.from('academy_items').select('*').eq('org_id', ctx.org.id)
  ]);
  if (error) throw error;
  data.forEach(r => s.progress.set(r.item_id, r));
  s.items = items.error ? [] : items.data;
  s.ai = await aiAvailable().catch(() => false);
  const open = new URLSearchParams(location.hash.split('?')[1] || '').get('ac');
  if (open) setTimeout(() => openItem(open), 0);
  s.day = programDay(ctx.profile?.created_at || ctx.membership?.joined_at || new Date());
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  const lessonsDone = LESSONS.filter(l => s.progress.has(l.id)).length;
  const tasksDone = FIRST_14.filter(t => s.progress.has(t.id)).length;
  el.querySelector('#a-sub').textContent = s.day <= 90
    ? `Programın ${s.day}. günündesin · ${lessonsDone}/${LESSONS.length} ders · ${tasksDone}/${FIRST_14.length} başlangıç adımı`
    : `90 günlük programı geçtin · ${lessonsDone}/${LESSONS.length} ders tamam`;
  const body = el.querySelector('#a-body');
  if (s.tab === 'kutuphane') { body.innerHTML = viewLibrary(); return; }
  if (s.tab === 'yonetim') { body.innerHTML = viewAdmin(); loadTeam(); return; }
  if (s.tab === 'baslangic') body.innerHTML = viewStart();
  else if (s.tab === 'program') body.innerHTML = viewProgram();
  else { body.innerHTML = '<div class="card empty"><p class="muted">Hesaplanıyor…</p></div>'; loadBadges(body); }
}

// ====================================================================
// Kütüphane
const libDone = () => new Set([...s.progress.keys()].filter(k => k.startsWith('lib:')));
const published = () => s.items.filter(x => x.published);

function itemCard(x, done) {
  const k = KINDS[x.kind], c = catById(x.category), ok = done.has(progressId(x.id));
  return `<button class="card lib-item ${ok ? 'done' : ''}" data-open="${x.id}">
    <span class="lib-icon k-${x.kind}"><i class="ti ${k.icon}" aria-hidden="true"></i></span>
    <span class="lib-main"><strong>${esc(x.title)}</strong>
      ${x.summary ? `<span class="small muted">${esc(x.summary.slice(0, 120))}${x.summary.length > 120 ? '…' : ''}</span>` : ''}
      <span class="lib-meta small">${esc(k.label)} · ${esc(c.label)}${x.minutes ? ` · ${x.minutes} dk` : ''} · ${esc(LEVELS[x.level])}
        ${x.required ? '<span class="badge gold">Zorunlu</span>' : ''}${x.quiz?.length ? '<span class="badge">Quiz</span>' : ''}${x.published ? '' : '<span class="badge warn">Taslak</span>'}</span></span>
    <i class="ti ${ok ? 'ti-circle-check' : 'ti-circle'} lib-check" aria-label="${ok ? 'Tamamlandı' : 'Tamamlanmadı'}"></i>
  </button>`;
}

function viewLibrary() {
  const done = libDone();
  const items = published();
  const path = requiredPath(items, done);
  const list = filterItems(items, { category: s.cat, q: s.q });
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.id, items.filter(x => x.category === c.id).length]));
  if (!items.length) {
    return `<div class="card empty"><i class="ti ti-books" aria-hidden="true"></i><h2>Kütüphane henüz boş</h2>
      <p class="muted">${isLead() ? 'Ekibinin kendini eğitebilmesi için PDF, video, HTML sayfa, bağlantı ya da yazı ekle. Ürünler, şirket, kazanç planı ve satış eğitimleri için kategoriler hazır.'
        : 'Liderin materyal ekledikçe burada görünecek. Bu sırada "90 gün programı" derslerine başlayabilirsin.'}</p>
      ${isLead() ? '<button class="btn btn-gold" data-act="item-new"><i class="ti ti-plus" aria-hidden="true"></i> İlk materyali ekle</button>' : ''}</div>`;
  }
  return `
    ${path.total ? `<section class="card path-card">
      <h2><i class="ti ti-route" aria-hidden="true"></i> Öğrenme yolun <span class="small muted">· ${path.done}/${path.total} zorunlu materyal</span></h2>
      <div class="meter lg"><span style="width:${path.pct}%" class="${path.pct === 100 ? 'done' : ''}"></span></div>
      ${path.next ? `<div class="path-next"><span>Sıradaki: <strong>${esc(path.next.title)}</strong>${path.next.minutes ? ` · ${path.next.minutes} dk` : ''}</span>
        <button class="btn btn-gold" data-open="${path.next.id}"><i class="ti ti-player-play" aria-hidden="true"></i> Devam et</button></div>`
        : '<p class="small muted">Tüm zorunlu materyalleri bitirdin. Şimdi öğrendiklerini sahada uygula ve yeni gelene anlat.</p>'}
    </section>` : ''}
    <div class="lib-tools">
      <div class="field"><label class="sr-only" for="lib-q">Kütüphanede ara</label>
        <input id="lib-q" data-lib="q" type="search" placeholder="Ara: ürün adı, konu…" value="${esc(s.q)}"></div>
      ${isLead() ? '<button class="btn btn-ghost" data-act="item-new"><i class="ti ti-plus" aria-hidden="true"></i> Materyal ekle</button>' : ''}
    </div>
    <div class="chips lib-cats" role="group" aria-label="Kategoriler">
      <button class="chip" data-cat="" aria-pressed="${!s.cat}">Tümü <span class="small">${items.length}</span></button>
      ${CATEGORIES.filter(c => counts[c.id]).map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="${s.cat === c.id}"><i class="ti ${c.icon}" aria-hidden="true"></i>${esc(c.label)} <span class="small">${counts[c.id]}</span></button>`).join('')}
    </div>
    ${s.cat && DISCLAIMERS[s.cat] ? `<p class="note small"><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(DISCLAIMERS[s.cat])}</p>` : ''}
    <div id="lib-list" class="lib-grid">${list.map(x => itemCard(x, done)).join('') || '<p class="muted">Aramana uyan materyal yok.</p>'}</div>`;
}

async function signed(path) {
  const { data, error } = await supabase.storage.from('akademi').createSignedUrl(path, 3600);
  if (error) throw new Error('Dosya açılamadı: ' + trError(error));
  return data.signedUrl;
}

let pdfLib = null;
async function renderPdf(box, url) {
  box.innerHTML = '<p class="muted small">PDF yükleniyor…</p>';
  try {
    if (!pdfLib) {
      pdfLib = await import('../vendor/pdfjs/pdf.min.mjs');
      pdfLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    }
    const doc = await pdfLib.getDocument({ url }).promise;
    box.innerHTML = `<p class="small muted">${doc.numPages} sayfa</p>`;
    const width = Math.min(box.clientWidth || 600, 900);
    for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
      if (!box.isConnected) return;
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = (width / vp1.width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height; cv.className = 'pdf-page';
      cv.setAttribute('aria-label', `Sayfa ${i}`);
      box.appendChild(cv);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
    if (doc.numPages > 80) box.insertAdjacentHTML('beforeend', '<p class="small muted">İlk 80 sayfa gösterildi; tamamı için "Yeni sekmede aç".</p>');
    s.pdfText = null; s.pdfDoc = doc;
  } catch (e) {
    box.innerHTML = `<p class="error">PDF gösterilemedi (${esc(e.message || e)}). "Yeni sekmede aç" ile dene.</p>`;
  }
}

async function openItem(id) {
  const x = s.items.find(i => i.id === id);
  if (!x) return;
  const d = el.querySelector('#a-dialog');
  const done = s.progress.has(progressId(x.id));
  const c = catById(x.category);
  d.innerHTML = `<form data-form="lib-done" data-id="${x.id}" novalidate>
    <header class="sheet-head"><div><div class="eyebrow"><i class="ti ${c.icon}" aria-hidden="true"></i> ${esc(c.label)} · ${esc(KINDS[x.kind].label)}${x.minutes ? ` · ${x.minutes} dk` : ''}</div>
      <h2 id="a-dialog-title">${esc(x.title)}</h2></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body lesson-body">
      ${DISCLAIMERS[x.category] ? `<p class="note small"><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(DISCLAIMERS[x.category])}</p>` : ''}
      ${x.summary ? `<p class="muted">${esc(x.summary)}</p>` : ''}
      <div id="lib-view" class="lib-view"><p class="muted small">Yükleniyor…</p></div>
      ${x.kind !== 'yazi' && x.body ? `<div class="lib-notes">${renderText(x.body, esc)}</div>` : ''}
      ${x.quiz?.length ? `<h3>Kısa quiz</h3>${x.quiz.map((q, qi) => `<fieldset class="quiz-q" data-q="${qi}"><legend>${qi + 1}. ${esc(q.q)}</legend>
        ${q.o.map((o, oi) => `<label class="quiz-o"><input type="radio" name="q${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}` : ''}
      <p class="error" id="q-error" role="alert"></p>
      ${done ? `<p class="small muted"><i class="ti ti-circle-check" aria-hidden="true"></i> Bunu tamamladın${s.progress.get(progressId(x.id))?.score != null ? ` (%${s.progress.get(progressId(x.id)).score})` : ''}.</p>` : ''}
    </div>
    <footer class="sheet-foot">
      ${isLead() ? `<button type="button" class="btn btn-ghost" data-act="item-edit" data-id="${x.id}"><i class="ti ti-pencil" aria-hidden="true"></i> Düzenle</button>` : ''}
      <span id="lib-ext"></span>
      <button class="btn btn-primary" type="submit">${x.quiz?.length ? 'Cevapları kontrol et' : done ? 'Tamamlandı ✓' : 'Tamamladım'}</button></footer></form>`;
  if (!d.open) d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
  const view = d.querySelector('#lib-view'), ext = d.querySelector('#lib-ext');
  try {
    if (x.kind === 'yazi') { view.innerHTML = renderText(x.body, esc); return; }
    if (x.kind === 'link') {
      const emb = embedUrl(x.url);
      view.innerHTML = emb ? `<div class="embed"><iframe src="${esc(emb)}" title="${esc(x.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`
        : `<p><a class="btn btn-gold" href="${esc(x.url)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Bağlantıyı aç</a></p>`;
      return;
    }
    if (!x.file_path) { view.innerHTML = '<p class="muted">Dosya eklenmemiş.</p>'; return; }
    const url = await signed(x.file_path);
    ext.innerHTML = `<a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Yeni sekmede aç</a>`;
    if (x.kind === 'pdf') await renderPdf(view, url);
    else if (x.kind === 'video') view.innerHTML = `<video src="${esc(url)}" controls playsinline preload="metadata" class="lib-video"></video>`;
    else if (x.kind === 'gorsel') view.innerHTML = `<img src="${esc(url)}" alt="${esc(x.title)}" class="lib-img">`;
    else if (x.kind === 'html') {
      const html = await (await fetch(url)).text();
      view.innerHTML = '<div class="embed html"><iframe sandbox="allow-scripts allow-popups" title="' + esc(x.title) + '"></iframe></div>';
      view.querySelector('iframe').srcdoc = html;
    }
  } catch (e) { view.innerHTML = `<p class="error">${esc(e.message || e)}</p>`; }
}

async function submitLib(form) {
  const x = s.items.find(i => i.id === form.dataset.id);
  if (!x) return;
  const err = form.querySelector('#q-error');
  let score = null;
  if (x.quiz?.length) {
    const ans = x.quiz.map((_, qi) => form.querySelector(`[name="q${qi}"]:checked`));
    if (ans.some(a => !a)) { err.textContent = 'Tüm soruları cevapla.'; return; }
    const res = scoreQuiz(x.quiz, ans.map(a => +a.value));
    x.quiz.forEach((q, qi) => form.querySelectorAll(`[data-q="${qi}"] .quiz-o`).forEach((lab, oi) => {
      lab.classList.toggle('right', oi === q.a); lab.classList.toggle('wrong', oi === +ans[qi].value && oi !== q.a);
    }));
    if (res.right / res.total < PASS_RATIO) { err.textContent = `${res.right}/${res.total} doğru. Materyale bir kez daha göz atıp tekrar dene.`; return; }
    score = res.score;
  }
  err.textContent = '';
  const prev = s.progress.get(progressId(x.id));
  const { data, error } = await supabase.from('academy_progress').upsert({ user_id: ctx.user.id, item_id: progressId(x.id), kind: 'kutuphane',
    score: score == null ? prev?.score ?? null : Math.max(score, prev?.score || 0), completed_at: prev?.completed_at || new Date().toISOString() }).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.progress.set(progressId(x.id), data);
  el.querySelector('#a-dialog').close();
  const path = requiredPath(published(), libDone());
  toast(score != null ? `Tamamlandı: %${score}.` : 'Tamamlandı olarak işaretlendi.');
  if (x.required && path.total && path.done === path.total) toast('Öğrenme yolunun tamamını bitirdin!');
  draw();
}

// ---------------- Yönetim (sahip / lider) ----------------
function viewAdmin() {
  const all = sortItems(s.items);
  return `<section class="card">
      <div class="card-head"><h2><i class="ti ti-books" aria-hidden="true"></i> Materyaller <span class="small muted">· ${all.length}</span></h2>
        <button class="btn btn-gold" data-act="item-new"><i class="ti ti-plus" aria-hidden="true"></i> Materyal ekle</button></div>
      <p class="small muted">PDF, video (50 MB'a kadar ya da YouTube/Vimeo/Drive bağlantısı), HTML sayfa, görsel, bağlantı ya da yazı ekleyebilirsin. "Zorunlu" işaretlediklerin yeni gelenlerin öğrenme yolunu oluşturur.</p>
      ${all.length ? `<ul class="entry-list admin-list">${all.map(x => `<li><button class="link-btn" data-act="item-edit" data-id="${x.id}">
          <i class="ti ${KINDS[x.kind].icon}" aria-hidden="true"></i> ${esc(x.title)}</button>
          <span class="small muted">${esc(catById(x.category).label)}${x.required ? ' · Zorunlu' : ''}${x.published ? '' : ' · Taslak'}</span></li>`).join('')}</ul>` : ''}
    </section>
    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-users" aria-hidden="true"></i> Ekibin ilerlemesi</h2>
      <div id="team-prog"><p class="muted small">Yükleniyor…</p></div>
    </section>`;
}

async function loadTeam() {
  const box = el.querySelector('#team-prog');
  const { data, error } = await supabase.rpc('academy_team_progress', { p_org: ctx.org.id });
  if (!box?.isConnected) return;
  if (error) { box.innerHTML = `<p class="error">${esc(trError(error))}</p>`; return; }
  if (!data.length) { box.innerHTML = '<p class="muted small">Ekipte henüz kimse yok. Ekip → Davet ile ekip arkadaşlarını davet et.</p>'; return; }
  box.innerHTML = `<div class="table-wrap"><table class="quota"><thead><tr><th>Kişi</th><th>Zorunlu yol</th><th>Toplam</th><th>Son çalışma</th></tr></thead><tbody>
    ${data.map(m => {
      const pct = m.required_total ? Math.round(m.required_done / m.required_total * 100) : 0;
      const quiet = !m.last_at || Date.now() - new Date(m.last_at) > 7 * 864e5;
      return `<tr><td>${esc(m.full_name || 'İsimsiz')}${m.user_id === ctx.user.id ? ' <span class="small muted">(sen)</span>' : ''}</td>
        <td>${m.required_total ? `<div class="meter"><span style="width:${pct}%" class="${pct === 100 ? 'done' : ''}"></span></div><span class="small">${m.required_done}/${m.required_total}</span>` : '—'}</td>
        <td>${m.library_done}</td>
        <td class="${quiet ? 'q-miss' : ''}">${m.last_at ? esc(new Date(m.last_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })) : 'Hiç'}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="small muted">7 günden uzun süredir çalışmayanlar turuncu görünür. Yargılamadan, "nasıl gidiyor, takıldığın yer var mı?" diye sor.</p>`;
}

function itemForm(x = null) {
  const v = x || { kind: 'pdf', category: s.cat || 'baslangic', level: 'baslangic', required: false, published: true, sort: 100 };
  const d = el.querySelector('#a-dialog');
  d.innerHTML = `<form data-form="item" data-id="${x ? x.id : ''}" novalidate>
    <header class="sheet-head"><h2 id="a-dialog-title">${x ? 'Materyali düzenle' : 'Materyal ekle'}</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><span class="label">Tür</span><div class="chips" role="radiogroup" aria-label="Materyal türü">${Object.entries(KINDS).map(([k, t]) =>
        `<label class="chip radio-chip"><input type="radio" name="kind" value="${k}" ${k === v.kind ? 'checked' : ''}><i class="ti ${t.icon}" aria-hidden="true"></i>${esc(t.label)}</label>`).join('')}</div></div>
      <div class="field kind-file"><label for="i-file">Dosya ${x?.file_name ? `(şu an: ${esc(x.file_name)})` : ''}</label><input id="i-file" name="file" type="file">
        <span class="small muted">En fazla 50 MB. Büyük videolar için YouTube'a "liste dışı" yükleyip "Bağlantı" türünü kullan.</span></div>
      <div class="field kind-link"><label for="i-url">Bağlantı (YouTube, Vimeo, Google Drive ya da web sayfası)</label><input id="i-url" name="url" type="url" value="${esc(v.url || '')}" placeholder="https://"></div>
      <div class="field"><label for="i-title">Başlık *</label><input id="i-title" name="title" maxlength="160" value="${esc(v.title || '')}"></div>
      <div class="field"><label for="i-sum">Kısa açıklama</label><textarea id="i-sum" name="summary" rows="2" maxlength="600">${esc(v.summary || '')}</textarea></div>
      <div class="form-2">
        <div class="field"><label for="i-cat">Kategori</label><select id="i-cat" name="category">${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === v.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="i-lvl">Seviye</label><select id="i-lvl" name="level">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${k === v.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-2">
        <div class="field"><label for="i-min">Süre (dakika)</label><input id="i-min" name="minutes" type="number" min="1" max="600" value="${esc(v.minutes ?? '')}"></div>
        <div class="field"><label for="i-sort">Sıra</label><input id="i-sort" name="sort" type="number" min="0" max="9999" value="${esc(v.sort ?? 100)}"></div>
      </div>
      <div class="field"><label for="i-body">${v.kind === 'yazi' ? 'Metin *' : 'Notlar (isteğe bağlı)'}</label>
        <textarea id="i-body" name="body" rows="8" maxlength="20000" placeholder="Boş satır = yeni paragraf · '- ' ile madde · '## ' ile ara başlık">${esc(v.body || '')}</textarea></div>
      <label class="inline-check"><input type="checkbox" name="required" ${v.required ? 'checked' : ''}> Zorunlu (yeni gelenlerin öğrenme yoluna eklenir)</label><br>
      <label class="inline-check"><input type="checkbox" name="published" ${v.published ? 'checked' : ''}> Yayında (işaretsizse yalnızca liderler görür)</label>
      <fieldset class="reel-scene" style="margin-top:12px"><legend>Quiz (isteğe bağlı)</legend>
        <textarea id="i-quiz" name="quiz" rows="6" placeholder="Soru?&#10;* doğru seçenek&#10;- yanlış seçenek&#10;- yanlış seçenek&#10;&#10;İkinci soru?&#10;- …">${esc(quizToText(v.quiz))}</textarea>
        <span class="small muted">Sorular arasında boş satır bırak; doğru seçeneğin başına * koy. Geçme notu %60.</span>
        ${s.ai ? '<div class="quick"><button type="button" class="btn btn-ghost" data-act="quiz-ai"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile quiz üret</button></div>' : ''}
      </fieldset>
      <p class="error" id="i-error" role="alert"></p>
    </div>
    <footer class="sheet-foot">
      ${x ? `<button type="button" class="btn btn-ghost" data-act="item-del" data-id="${x.id}">Sil</button>` : ''}
      <button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  if (!d.open) d.showModal();
  syncKind(d.querySelector('form'));
}
function syncKind(form) {
  const kind = form.elements.kind.value;
  form.querySelector('.kind-file').hidden = !['pdf', 'video', 'html', 'gorsel'].includes(kind);
  form.querySelector('.kind-link').hidden = kind !== 'link';
  form.elements.file.accept = KINDS[kind].accept;
  form.querySelector('label[for="i-body"]').textContent = kind === 'yazi' ? 'Metin *' : 'Notlar (isteğe bağlı)';
}

async function saveItem(form) {
  const f = n => form.elements[n];
  const err = form.querySelector('#i-error');
  const id = form.dataset.id, old = s.items.find(i => i.id === id);
  const kind = f('kind').value, file = f('file').files[0];
  const row = {
    kind, title: f('title').value.trim(), summary: f('summary').value.trim() || null, category: f('category').value, level: f('level').value,
    minutes: f('minutes').value ? +f('minutes').value : null, sort: f('sort').value ? +f('sort').value : 100,
    body: f('body').value.trim() || null, required: f('required').checked, published: f('published').checked,
    url: kind === 'link' ? f('url').value.trim() : null
  };
  const qt = f('quiz').value.trim();
  row.quiz = qt ? parseQuizText(qt) : null;
  if (row.title.length < 2) { err.textContent = 'Başlık yaz.'; return; }
  if (kind === 'link' && !/^https?:\/\//i.test(row.url || '')) { err.textContent = 'Geçerli bir bağlantı gir (https://…).'; return; }
  if (kind === 'yazi' && !row.body) { err.textContent = 'Metni yaz.'; return; }
  if (qt && !row.quiz) { err.textContent = 'Quiz biçimi okunamadı: her soruda en az 2 seçenek ve * ile işaretli bir doğru cevap olmalı.'; return; }
  const needsFile = ['pdf', 'video', 'html', 'gorsel'].includes(kind);
  if (needsFile && !file && !(old?.file_path && old.kind === kind)) { err.textContent = 'Dosya seç.'; return; }
  if (file) {
    if (kindFromFile(file) !== kind) { err.textContent = `Seçtiğin dosya ${KINDS[kind].label} değil.`; return; }
    if (file.size > 50 * 1048576) { err.textContent = 'Dosya 50 MB\'tan büyük. Videoyu YouTube\'a "liste dışı" yükleyip bağlantı olarak ekleyebilirsin.'; return; }
  }
  err.textContent = file ? 'Dosya yükleniyor…' : '';
  try {
    if (file) {
      const ext = (file.name.split('.').pop() || kind).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
      const path = `${ctx.org.id}/${crypto.randomUUID()}.${ext}`;
      const type = kind === 'html' ? 'text/html' : file.type;
      const up = await supabase.storage.from('akademi').upload(path, file, { contentType: type });
      if (up.error) throw new Error(trError(up.error));
      Object.assign(row, { file_path: path, file_name: file.name.slice(0, 160), file_size: file.size });
    } else if (!needsFile) Object.assign(row, { file_path: null, file_name: null, file_size: null });
    const q = id ? supabase.from('academy_items').update(row).eq('id', id).select().single()
      : supabase.from('academy_items').insert({ ...row, org_id: ctx.org.id }).select().single();
    const { data, error } = await q;
    if (error) throw new Error(trError(error));
    if (old?.file_path && old.file_path !== data.file_path) await supabase.storage.from('akademi').remove([old.file_path]);
    s.items = id ? s.items.map(i => (i.id === id ? data : i)) : [...s.items, data];
    el.querySelector('#a-dialog').close();
    toast(id ? 'Materyal güncellendi.' : 'Materyal eklendi.');
    draw();
  } catch (e) { err.textContent = e.message; }
}

async function delItem(id) {
  const x = s.items.find(i => i.id === id);
  if (!x || !confirm(`"${x.title}" silinsin mi? Ekibin ilerleme kayıtları da anlamını yitirir.`)) return;
  const { error } = await supabase.from('academy_items').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  if (x.file_path) await supabase.storage.from('akademi').remove([x.file_path]);
  s.items = s.items.filter(i => i.id !== id);
  el.querySelector('#a-dialog').close(); toast('Silindi.'); draw();
}

async function quizAi(btn) {
  const form = btn.closest('form');
  const id = form.dataset.id, x = s.items.find(i => i.id === id);
  let text = [form.elements.title.value, form.elements.summary.value, form.elements.body.value].join('\n\n');
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Hazırlanıyor…';
  try {
    if (x?.kind === 'pdf' && x.file_path && text.trim().length < 400) {
      if (!pdfLib) { pdfLib = await import('../vendor/pdfjs/pdf.min.mjs'); pdfLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; }
      const doc = await pdfLib.getDocument({ url: await signed(x.file_path) }).promise;
      for (let i = 1; i <= Math.min(doc.numPages, 15) && text.length < 9000; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        text += '\n' + tc.items.map(t => t.str).join(' ');
      }
    }
    if (text.trim().length < 120) throw new Error('Quiz için yeterli metin yok. Kısa açıklama ya da notlar alanına materyalin özetini yaz.');
    const out = await aiChat({ maxTokens: 1200, messages: [{ role: 'user', content: aiQuizPrompt({ title: form.elements.title.value }, text) }] });
    const quiz = normalizeQuiz(extractJSON(out)?.quiz);
    if (!quiz) throw new Error('AI geçerli bir quiz döndürmedi; tekrar dene.');
    form.elements.quiz.value = quizToText(quiz);
    toast('Quiz hazır; doğruluğunu kontrol edip düzenle.');
  } catch (e) { form.querySelector('#i-error').textContent = 'AI: ' + e.message; }
  btn.disabled = false; btn.innerHTML = old;
}

function onInput(e) {
  if (e.target.dataset.lib === 'q') {
    s.q = e.target.value;
    const box = el.querySelector('#lib-list');
    if (box) box.innerHTML = filterItems(published(), { category: s.cat, q: s.q }).map(x => itemCard(x, libDone())).join('') || '<p class="muted">Aramana uyan materyal yok.</p>';
  }
}

function viewStart() {
  const done = FIRST_14.filter(t => s.progress.has(t.id)).length;
  return `<section class="card">
    <h2><i class="ti ti-rocket" aria-hidden="true"></i> İlk 14 gün kontrol listesi</h2>
    <div class="meter lg"><span style="width:${Math.round((done / FIRST_14.length) * 100)}%" class="${done === FIRST_14.length ? 'done' : ''}"></span></div>
    <p class="small muted">${done}/${FIRST_14.length} tamam. Yeni başlayanların çoğu ilk haftalarda ne yapacağını bilmediği için bırakır; bu liste o boşluğu doldurur.</p>
    <ul class="checklist">
      ${FIRST_14.map(t => `<li class="${s.progress.has(t.id) ? 'done' : ''} ${t.day <= s.day && !s.progress.has(t.id) ? 'due' : ''}">
        <label><input type="checkbox" data-task="${t.id}" ${s.progress.has(t.id) ? 'checked' : ''}>
          <span><strong>Gün ${t.day} · ${esc(t.title)}</strong><span class="small muted">${esc(t.tip)}</span></span></label></li>`).join('')}
    </ul></section>`;
}

function viewProgram() {
  const current = MODULES.find(m => s.day >= m.days[0] && s.day <= m.days[1])?.id;
  const next = LESSONS.find(l => !s.progress.has(l.id));
  return `
    ${next ? `<div class="card import-card"><i class="ti ti-player-play" aria-hidden="true"></i>
      <div><strong>Sıradaki ders: ${esc(next.title)}</strong><p class="small muted">${next.minutes} dakika · ${esc(MODULES.find(m => m.id === next.module).title)}</p></div>
      <div class="import-actions"><button class="btn btn-gold" data-lesson="${next.id}">Başla</button></div></div>` :
      '<div class="card empty"><i class="ti ti-certificate" aria-hidden="true"></i><h2>Tüm dersleri bitirdin</h2><p class="muted">Şimdi öğrendiklerini ekibine öğretme zamanı.</p></div>'}
    ${MODULES.map(m => {
      const list = LESSONS.filter(l => l.module === m.id);
      const done = list.filter(l => s.progress.has(l.id)).length;
      return `<section class="card module ${m.id === current ? 'current' : ''}">
        <header><div><h2>${esc(m.title)} <span class="small muted">· Gün ${m.days[0]}-${m.days[1]}</span></h2>
          <p class="small muted">${esc(m.summary)}</p></div><span class="badge ${done === list.length ? 'ok' : m.id === current ? 'gold' : ''}">${done}/${list.length}</span></header>
        <ol class="lesson-list">${list.map(l => {
          const p = s.progress.get(l.id);
          return `<li><button class="lesson ${p ? 'done' : ''}" data-lesson="${l.id}">
            <i class="ti ${p ? 'ti-circle-check' : 'ti-circle'}" aria-hidden="true"></i>
            <span>${esc(l.title)}</span><span class="small muted">${p ? `%${p.score ?? 100}` : l.minutes + ' dk'}</span></button></li>`;
        }).join('')}</ol></section>`;
    }).join('')}`;
}

function lessonDialog(id) {
  const l = lessonById(id);
  if (!l) return;
  const p = s.progress.get(id);
  const d = el.querySelector('#a-dialog');
  d.innerHTML = `<form data-form="quiz" data-id="${l.id}" novalidate>
    <header class="sheet-head"><div><div class="eyebrow">${esc(MODULES.find(m => m.id === l.module).title)} · ${l.minutes} dk</div>
      <h2 id="a-dialog-title">${esc(l.title)}</h2></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body lesson-body">
      ${l.body.map(par => `<p>${esc(par)}</p>`).join('')}
      <div class="card key"><h3>Akılda kalsın</h3><ul>${l.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card key ex"><h3><i class="ti ti-pencil" aria-hidden="true"></i> Alıştırma</h3><p>${esc(l.exercise)}</p></div>
      <h3>Kısa quiz</h3>
      ${l.quiz.map((q, qi) => `<fieldset class="quiz-q" data-q="${qi}"><legend>${qi + 1}. ${esc(q.q)}</legend>
        ${q.o.map((o, oi) => `<label class="quiz-o"><input type="radio" name="q${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')}
      </fieldset>`).join('')}
      <p class="error" id="q-error" role="alert"></p>
      ${p ? `<p class="small muted">Bu dersi %${p.score ?? 100} ile tamamladın. İstersen quizi tekrar çözebilirsin.</p>` : ''}
    </div>
    <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-act="close">Kapat</button>
      <button class="btn btn-primary" type="submit">Cevapları kontrol et</button></footer></form>`;
  d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
}

// ====================================================================
async function loadBadges(body) {
  const head = q => q.then(r => r.count || 0);
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  const [prospects, contacts, presentations, invites, wins, reviews, recent] = await Promise.all([
    head(supabase.from('prospects').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
    head(supabase.from('interactions').select('id', { count: 'exact', head: true }).neq('kind', 'not')),
    head(supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('kind', 'sunum')),
    head(supabase.from('stage_events').select('id', { count: 'exact', head: true }).eq('to_stage', 'davet').not('from_stage', 'is', null)),
    head(supabase.from('stage_events').select('id', { count: 'exact', head: true }).in('to_stage', ['musteri', 'is_ortagi']).not('from_stage', 'is', null)),
    head(supabase.from('weekly_reviews').select('id', { count: 'exact', head: true })),
    fetchAll(() => supabase.from('interactions').select('prospect_id, kind, occurred_at').gte('occurred_at', since))
  ]);
  const streak = activeStreak(dailyMetrics({ interactions: recent.data || [] }));
  const temel = LESSONS.filter(l => l.module === 'temel');
  const stats = {
    prospects, contacts, presentations, invites, wins, reviews, streak,
    lessons: LESSONS.filter(l => s.progress.has(l.id)).length, totalLessons: LESSONS.length,
    tasks: FIRST_14.filter(t => s.progress.has(t.id)).length, totalTasks: FIRST_14.length,
    temelDone: temel.every(l => s.progress.has(l.id))
  };
  const badges = earnedBadges(stats);
  if (s.tab !== 'rozet') return;
  body.innerHTML = `<p class="small muted">${badges.filter(b => b.earned).length}/${badges.length} rozet kazandın. Rozetler kaydettiğin aktivitelerden otomatik hesaplanır.</p>
    <div class="badge-grid">${badges.map(b => `<div class="card rozet ${b.earned ? 'on' : ''}">
      <span class="rozet-icon"><i class="ti ${b.icon}" aria-hidden="true"></i></span>
      <strong>${esc(b.title)}</strong><span class="small muted">${esc(b.desc)}</span>
      ${b.earned ? '<span class="badge ok">Kazanıldı</span>' : '<span class="badge">Kilitli</span>'}</div>`).join('')}</div>`;
}

// ====================================================================
function onClick(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/akademi?tab=${s.tab}`); draw(); return; }
  const les = e.target.closest('[data-lesson]');
  if (les) { lessonDialog(les.dataset.lesson); return; }
  const op = e.target.closest('[data-open]');
  if (op) { openItem(op.dataset.open); return; }
  const cat = e.target.closest('[data-cat]');
  if (cat) { s.cat = cat.dataset.cat; draw(); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const aid = e.target.closest('[data-act]')?.dataset.id;
  if (act === 'item-new') { itemForm(); return; }
  if (act === 'item-edit') { itemForm(s.items.find(i => i.id === aid)); return; }
  if (act === 'item-del') { delItem(aid); return; }
  if (act === 'quiz-ai') { quizAi(e.target.closest('[data-act]')); return; }
  if (act === 'close') { el.querySelector('#a-dialog').close(); draw(); }
}

async function onChange(e) {
  if (e.target.name === 'kind' && e.target.closest('form[data-form="item"]')) { syncKind(e.target.closest('form')); return; }
  const id = e.target.dataset.task;
  if (!id) return;
  const box = e.target;
  box.disabled = true;
  const q = box.checked
    ? supabase.from('academy_progress').upsert({ user_id: ctx.user.id, item_id: id, kind: 'gorev' }).select().single()
    : supabase.from('academy_progress').delete().eq('user_id', ctx.user.id).eq('item_id', id);
  const { data, error } = await q;
  box.disabled = false;
  if (error) { box.checked = !box.checked; toast(trError(error)); return; }
  if (box.checked) s.progress.set(id, data); else s.progress.delete(id);
  draw();
  if (box.checked && FIRST_14.every(t => s.progress.has(t.id))) toast('İlk 14 gün tamam! "Sağlam başlangıç" rozetini kazandın.');
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'item') { const b = form.querySelector('[type=submit]'); b.disabled = true; await saveItem(form); b.disabled = false; return; }
  if (form.dataset.form === 'lib-done') { const b = form.querySelector('[type=submit]'); b.disabled = true; await submitLib(form); if (b.isConnected) b.disabled = false; return; }
  if (form.dataset.form !== 'quiz') return;
  const l = lessonById(form.dataset.id);
  const err = form.querySelector('#q-error');
  const answers = l.quiz.map((_, qi) => form.querySelector(`[name="q${qi}"]:checked`));
  if (answers.some(a => !a)) { err.textContent = 'Tüm soruları cevapla.'; return; }
  err.textContent = '';
  let correct = 0;
  l.quiz.forEach((q, qi) => {
    const fs = form.querySelector(`[data-q="${qi}"]`);
    fs.querySelectorAll('.quiz-o').forEach((lab, oi) => {
      lab.classList.toggle('right', oi === q.a);
      lab.classList.toggle('wrong', oi === +answers[qi].value && oi !== q.a);
    });
    if (+answers[qi].value === q.a) correct++;
  });
  const score = Math.round((correct / l.quiz.length) * 100);
  const btn = form.querySelector('[type="submit"]');
  if (correct / l.quiz.length < PASS_RATIO) {
    err.textContent = `${correct}/${l.quiz.length} doğru. Dersi bir kez daha okuyup tekrar dene.`;
    return;
  }
  btn.disabled = true;
  const prev = s.progress.get(l.id);
  const { data, error } = await supabase.from('academy_progress')
    .upsert({ user_id: ctx.user.id, item_id: l.id, kind: 'ders', score: Math.max(score, prev?.score || 0), completed_at: prev?.completed_at || new Date().toISOString() })
    .select().single();
  btn.disabled = false;
  if (error) { err.textContent = trError(error); return; }
  s.progress.set(l.id, data);
  btn.textContent = 'Tamamlandı';
  toast(`Ders tamamlandı: ${correct}/${l.quiz.length} doğru.`);
}

