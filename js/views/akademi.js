// Akademi: Kütüphane (liderlerin eklediği PDF, video, HTML, bağlantı, yazı), İlk 14 gün, 90 günlük program, rozetler, yönetim
import { supabase, fetchAll } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { FIRST_14, MODULES, LESSONS, lessonById, PASS_RATIO } from '../akademi/content.js';
import { earnedBadges, programDay } from '../akademi/badges.js';
import { dailyMetrics, activeStreak } from '../olcum/metrics.js';
import { KINDS, LEVELS, DISCLAIMERS, progressId, kindFromFile, embedUrl, driveInfo, requiredPath, filterItems, sortItems,
  normalizeQuiz, scoreQuiz, aiQuizPrompt, renderText, parseQuizText, quizToText, FILE_KINDS, URL_KINDS, FOLDER_COLORS, DEFAULT_FOLDERS,
  childrenOf, folderPath, descendantIds, flatTree, folderStats, rootCategory, mimeOf, textDocHtml } from '../akademi/library.js';
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
  s = { tab: TABS.some(t => t.id === tab && (!t.lead || isLead())) ? tab : 'kutuphane', progress: new Map(), items: [], folders: [], folder: null, q: '', team: null };

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

  const [{ data, error }, items, folders] = await Promise.all([
    supabase.from('academy_progress').select('*'),
    supabase.from('academy_items').select('*').eq('org_id', ctx.org.id),
    supabase.from('academy_folders').select('*').eq('org_id', ctx.org.id)
  ]);
  if (error) throw error;
  data.forEach(r => s.progress.set(r.item_id, r));
  s.items = items.error ? [] : items.data;
  s.folders = folders.error ? [] : folders.data;
  const fq = new URLSearchParams(location.hash.split('?')[1] || '').get('klasor');
  if (fq && s.folders.some(f => f.id === fq)) s.folder = fq;
  seedFolders();
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
// Kütüphane: klasör ve alt klasörlerle düzenlenen materyaller (dosya yöneticisi düzeni)
const libDone = () => new Set([...s.progress.keys()].filter(k => k.startsWith('lib:')));
const published = () => s.items.filter(x => x.published || isLead());
const folderName = id => s.folders.find(f => f.id === id)?.name || 'Kütüphane';

function itemRow(x, done, { showPath = false } = {}) {
  const k = KINDS[x.kind] || KINDS.link, ok = done.has(progressId(x.id));
  const path = showPath && x.folder_id ? folderPath(s.folders, x.folder_id).map(f => f.name).join(' › ') : '';
  return `<li class="fm-row ${ok ? 'done' : ''}">
    <button class="fm-open" data-open="${x.id}">
      <span class="lib-icon k-${x.kind}"><i class="ti ${k.icon}" aria-hidden="true"></i></span>
      <span class="lib-main"><strong>${esc(x.title)}</strong>
        <span class="lib-meta small">${esc(k.label)}${x.minutes ? ` · ${x.minutes} dk` : ''}${path ? ` · ${esc(path)}` : ''}
          ${x.required ? '<span class="badge gold">Zorunlu</span>' : ''}${x.quiz?.length ? '<span class="badge">Quiz</span>' : ''}${x.published ? '' : '<span class="badge warn">Taslak</span>'}</span></span>
      <i class="ti ${ok ? 'ti-circle-check' : 'ti-circle'} lib-check" aria-label="${ok ? 'Tamamlandı' : 'Tamamlanmadı'}"></i>
    </button>
    ${isLead() ? `<button class="icon-btn" data-act="item-edit" data-id="${x.id}" aria-label="${esc(x.title)} düzenle"><i class="ti ti-dots-vertical" aria-hidden="true"></i></button>` : ''}
  </li>`;
}

function folderTile(f, done) {
  const st = folderStats(s.folders, published(), f.id, done);
  const pct = st.items ? Math.round(st.done / st.items * 100) : 0;
  return `<button class="fm-folder c-${f.color}" data-folder="${f.id}">
    <span class="fm-ficon"><i class="ti ti-folder" aria-hidden="true"></i></span>
    <span class="fm-fname">${esc(f.name)}</span>
    <span class="small muted">${st.items} materyal${st.sub ? ` · ${st.sub} klasör` : ''}</span>
    ${st.items ? `<span class="fm-fbar"><span style="width:${pct}%"></span></span>` : ''}
  </button>`;
}

function treeHtml(parentId = null, depth = 0) {
  return childrenOf(s.folders, parentId).map(f => {
    const open = s.folder && folderPath(s.folders, s.folder).some(p => p.id === f.id);
    const kids = childrenOf(s.folders, f.id).length;
    return `<li><button class="fm-tnode ${s.folder === f.id ? 'on' : ''}" data-folder="${f.id}" style="padding-left:${8 + depth * 14}px">
        <i class="ti ${kids ? (open ? 'ti-folder-open' : 'ti-folder') : 'ti-folder'} c-${f.color}" aria-hidden="true"></i>${esc(f.name)}</button>
      ${kids && open ? `<ul>${treeHtml(f.id, depth + 1)}</ul>` : ''}</li>`;
  }).join('');
}

function viewLibrary() {
  const done = libDone();
  const items = published();
  const path = requiredPath(items.filter(x => x.published), done);
  if (!items.length && !s.folders.length) {
    return `<div class="card empty"><i class="ti ti-books" aria-hidden="true"></i><h2>Kütüphane henüz boş</h2>
      <p class="muted">${isLead() ? 'Klasörler hazırlanıyor… Birkaç saniye sonra sayfayı yenile.' : 'Liderin materyal ekledikçe burada görünecek. Bu sırada "90 gün programı" derslerine başlayabilirsin.'}</p></div>`;
  }
  const crumbs = s.folder ? folderPath(s.folders, s.folder) : [];
  const cur = s.folders.find(f => f.id === s.folder);
  const subs = childrenOf(s.folders, s.folder);
  const q = s.q.trim();
  const list = q ? filterItems(items, { q }) : sortItems(items.filter(x => (x.folder_id || null) === (s.folder || null)));
  const cat = cur ? rootCategory(s.folders, cur.id) : '';
  return `
    ${path.total ? `<section class="card path-card">
      <h2><i class="ti ti-route" aria-hidden="true"></i> Öğrenme yolun <span class="small muted">· ${path.done}/${path.total} zorunlu materyal</span></h2>
      <div class="meter lg"><span style="width:${path.pct}%" class="${path.pct === 100 ? 'done' : ''}"></span></div>
      ${path.next ? `<div class="path-next"><span>Sıradaki: <strong>${esc(path.next.title)}</strong>${path.next.minutes ? ` · ${path.next.minutes} dk` : ''}</span>
        <button class="btn btn-gold" data-open="${path.next.id}"><i class="ti ti-player-play" aria-hidden="true"></i> Devam et</button></div>`
        : '<p class="small muted">Tüm zorunlu materyalleri bitirdin. Şimdi öğrendiklerini sahada uygula ve yeni gelene anlat.</p>'}
    </section>` : ''}
    <section class="card fm">
      <aside class="fm-tree" aria-label="Klasörler">
        <button class="fm-tnode ${!s.folder ? 'on' : ''}" data-folder=""><i class="ti ti-books" aria-hidden="true"></i>Kütüphane</button>
        <ul>${treeHtml()}</ul>
      </aside>
      <div class="fm-main">
        <div class="fm-bar">
          <nav class="fm-crumbs" aria-label="Konum">
            <button class="link-btn" data-folder=""><i class="ti ti-books" aria-hidden="true"></i> Kütüphane</button>
            ${crumbs.map(f => `<i class="ti ti-chevron-right" aria-hidden="true"></i><button class="link-btn" data-folder="${f.id}">${esc(f.name)}</button>`).join('')}
          </nav>
          <input id="lib-q" data-lib="q" type="search" placeholder="Tüm kütüphanede ara…" value="${esc(s.q)}" aria-label="Kütüphanede ara">
        </div>
        ${isLead() ? `<div class="quick fm-actions">
          <button class="btn btn-gold sm" data-act="item-new"><i class="ti ti-file-plus" aria-hidden="true"></i> Materyal ekle</button>
          <button class="btn btn-ghost sm" data-act="folder-new"><i class="ti ti-folder-plus" aria-hidden="true"></i> ${cur ? 'Alt klasör' : 'Yeni klasör'}</button>
          ${cur ? `<button class="btn btn-ghost sm" data-act="folder-edit" data-id="${cur.id}"><i class="ti ti-pencil" aria-hidden="true"></i> Klasörü düzenle</button>` : ''}
        </div>` : ''}
        ${DISCLAIMERS[cat] && !q ? `<p class="note small"><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(DISCLAIMERS[cat])}</p>` : ''}
        ${!q && subs.length ? `<div class="fm-folders">${subs.map(f => folderTile(f, done)).join('')}</div>` : ''}
        ${list.length ? `<ul class="fm-list">${list.map(x => itemRow(x, done, { showPath: !!q })).join('')}</ul>`
          : (q ? '<p class="muted">Aramana uyan materyal yok.</p>' : (!subs.length ? `<p class="muted fm-empty"><i class="ti ti-folder-open" aria-hidden="true"></i> Bu klasör boş.${isLead() ? ' "Materyal ekle" ile doldur.' : ''}</p>` : ''))}
      </div>
    </section>`;
}

// İlk açılışta (lider) ana klasörleri oluştur ve eski materyalleri kategorilerine göre yerleştir
async function seedFolders() {
  if (!isLead() || s.folders.length) return;
  const { data, error } = await supabase.from('academy_folders').insert(DEFAULT_FOLDERS.map(f => ({ ...f, org_id: ctx.org.id }))).select();
  if (error) return;
  s.folders = data;
  for (const x of s.items.filter(i => !i.folder_id)) {
    const f = data.find(d => d.category === x.category);
    if (!f) continue;
    const r = await supabase.from('academy_items').update({ folder_id: f.id }).eq('id', x.id).select().single();
    if (!r.error) s.items = s.items.map(i => (i.id === x.id ? r.data : i));
  }
  if (s.tab === 'kutuphane') draw();
}

async function signed(path) {
  const { data, error } = await supabase.storage.from('akademi').createSignedUrl(path, 3600);
  if (error) throw new Error('Dosya açılamadı: ' + trError(error));
  return data.signedUrl;
}
// Dosyayı doğru türüyle indir (depo HTML'i düz metin olarak sunar; bu yüzden kod görünüyordu)
async function fileBlob(x) {
  const res = await fetch(await signed(x.file_path));
  if (!res.ok) throw new Error('Dosya indirilemedi.');
  const raw = await res.blob();
  return new Blob([raw], { type: mimeOf(x.file_name, raw.type) });
}

let pdfLib = null;
async function loadPdfLib() {
  if (!pdfLib) {
    pdfLib = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfLib;
}
async function renderPdf(box, data) {
  box.innerHTML = '<p class="muted small">PDF yükleniyor…</p>';
  try {
    const lib = await loadPdfLib();
    const doc = await lib.getDocument({ data }).promise;
    box.innerHTML = `<p class="small muted">${doc.numPages} sayfa</p>`;
    const width = Math.min(box.clientWidth || 600, 900);
    for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
      if (!box.isConnected) return;
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / vp1.width) * Math.min(2, window.devicePixelRatio || 1) });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height; cv.className = 'pdf-page'; cv.setAttribute('aria-label', `Sayfa ${i}`);
      box.appendChild(cv);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
    if (doc.numPages > 80) box.insertAdjacentHTML('beforeend', '<p class="small muted">İlk 80 sayfa gösterildi; tamamı için "Tarayıcıda aç".</p>');
  } catch (e) {
    box.innerHTML = `<p class="error">PDF gösterilemedi (${esc(e.message || e)}). "Tarayıcıda aç" ile dene.</p>`;
  }
}

// HTML'i ayrı sekmede, uygulamadan yalıtılmış biçimde aç (sayfa gibi görünür, uygulamaya erişemez)
function openHtmlTab(win, html, title) {
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
    <style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head><body><iframe sandbox="allow-scripts allow-popups allow-forms" title="${esc(title)}"></iframe></body></html>`);
  win.document.close();
  win.document.querySelector('iframe').srcdoc = html;
}
async function openInTab(x) {
  const win = window.open('', '_blank');
  if (!win) { toast('Açılır pencere engellendi; tarayıcı ayarından izin ver.'); return; }
  win.document.write('<p style="font-family:sans-serif;padding:20px">Açılıyor…</p>');
  try {
    if (x.kind === 'yazi') { openHtmlTab(win, textDocHtml(x.title, x.body, esc), x.title); return; }
    if (x.kind === 'html') { openHtmlTab(win, await (await fileBlob(x)).text(), x.title); return; }
    const blob = await fileBlob(x);
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    // Tarayıcı dosyayı gösteremezse (ör. telefonda PDF) indirme bağlantısı göster
    setTimeout(() => {
      try {
        if (!win.closed && win.location.href === 'about:blank') {
          win.document.body.innerHTML = `<div style="font-family:sans-serif;padding:24px;line-height:1.6"><h2>${esc(x.title)}</h2>
            <p>Bu tarayıcı dosyayı sekmede gösteremedi; telefonundaki uygulamayla açmak için indir.</p>
            <p><a href="${url}" download="${esc(x.file_name || x.title)}" style="font-size:18px">Dosyayı indir</a></p></div>`;
        }
      } catch { /* sekme dosyaya geçti */ }
    }, 2500);
  } catch (e) { win.close(); toast(e.message); }
}
async function downloadItem(x) {
  try {
    let blob, name = x.file_name || x.title;
    if (x.kind === 'yazi') { blob = new Blob(['﻿' + textDocHtml(x.title, x.body, esc)], { type: 'application/msword' }); name = `${x.title}.doc`; }
    else blob = await fileBlob(x);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

async function openItem(id) {
  const x = s.items.find(i => i.id === id);
  if (!x) return;
  const d = el.querySelector('#a-dialog');
  const done = s.progress.has(progressId(x.id));
  const crumbs = x.folder_id ? folderPath(s.folders, x.folder_id).map(f => f.name).join(' › ') : 'Kütüphane';
  const cat = x.folder_id ? rootCategory(s.folders, x.folder_id) : x.category;
  const ext = x.kind === 'link' || x.kind === 'drive';
  d.innerHTML = `<form data-form="lib-done" data-id="${x.id}" novalidate>
    <header class="sheet-head"><div><div class="eyebrow"><i class="ti ${KINDS[x.kind]?.icon}" aria-hidden="true"></i> ${esc(crumbs)}${x.minutes ? ` · ${x.minutes} dk` : ''}</div>
      <h2 id="a-dialog-title">${esc(x.title)}</h2></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body lesson-body">
      ${DISCLAIMERS[cat] ? `<p class="note small"><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(DISCLAIMERS[cat])}</p>` : ''}
      ${x.summary ? `<p class="muted">${esc(x.summary)}</p>` : ''}
      <div class="quick lib-open">
        ${ext ? `<a class="btn btn-ghost sm" href="${esc((driveInfo(x.url)?.open) || x.url)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> ${x.kind === 'drive' ? "Drive'da aç" : 'Bağlantıyı aç'}</a>`
          : `<button type="button" class="btn btn-ghost sm" data-act="lib-tab" data-id="${x.id}"><i class="ti ti-external-link" aria-hidden="true"></i> Tarayıcıda aç</button>
             <button type="button" class="btn btn-ghost sm" data-act="lib-dl" data-id="${x.id}"><i class="ti ti-download" aria-hidden="true"></i> ${x.kind === 'yazi' ? 'Word olarak indir' : x.kind === 'belge' ? 'İndir (Office ile aç)' : 'İndir'}</button>`}
      </div>
      <div id="lib-view" class="lib-view"><p class="muted small">Yükleniyor…</p></div>
      ${x.kind !== 'yazi' && x.body ? `<div class="lib-notes">${renderText(x.body, esc)}</div>` : ''}
      ${x.quiz?.length ? `<h3>Kısa quiz</h3>${x.quiz.map((q, qi) => `<fieldset class="quiz-q" data-q="${qi}"><legend>${qi + 1}. ${esc(q.q)}</legend>
        ${q.o.map((o, oi) => `<label class="quiz-o"><input type="radio" name="q${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}` : ''}
      <p class="error" id="q-error" role="alert"></p>
      ${done ? `<p class="small muted"><i class="ti ti-circle-check" aria-hidden="true"></i> Bunu tamamladın${s.progress.get(progressId(x.id))?.score != null ? ` (%${s.progress.get(progressId(x.id)).score})` : ''}.</p>` : ''}
    </div>
    <footer class="sheet-foot">
      ${isLead() ? `<button type="button" class="btn btn-ghost" data-act="item-edit" data-id="${x.id}"><i class="ti ti-pencil" aria-hidden="true"></i> Düzenle</button>` : ''}
      <button class="btn btn-primary" type="submit">${x.quiz?.length ? 'Cevapları kontrol et' : done ? 'Tamamlandı ✓' : 'Tamamladım'}</button></footer></form>`;
  if (!d.open) d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
  const view = d.querySelector('#lib-view');
  const frame = (src, cls = '') => `<div class="embed ${cls}"><iframe src="${esc(src)}" title="${esc(x.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  try {
    if (x.kind === 'yazi') { view.innerHTML = `<article class="lib-doc">${renderText(x.body, esc)}</article>`; return; }
    if (ext) {
      const di = driveInfo(x.url), emb = embedUrl(x.url);
      view.innerHTML = emb ? frame(emb, di && di.type !== 'file' ? 'tall' : (emb.includes('spotify') ? 'audio' : ''))
        + (di ? '<p class="small muted">Açılmıyorsa Drive\'da dosyanın paylaşımını "Bağlantıya sahip olan herkes görüntüleyebilir" yap.</p>' : '')
        : `<p class="muted">Bu bağlantı uygulama içinde gösterilemiyor. Yukarıdaki "Bağlantıyı aç" ile yeni sekmede açılır.</p>`;
      return;
    }
    if (!x.file_path) { view.innerHTML = '<p class="muted">Dosya eklenmemiş.</p>'; return; }
    if (x.kind === 'belge') {
      const url = await signed(x.file_path);
      view.innerHTML = frame(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`, 'tall')
        + '<p class="small muted">Önizleme Microsoft Office Online ile gösterilir. Telefonda en iyi sonuç için "İndir (Office ile aç)".</p>';
      return;
    }
    const blob = await fileBlob(x);
    if (!view.isConnected) return;
    const url = URL.createObjectURL(blob);
    if (x.kind === 'pdf') await renderPdf(view, new Uint8Array(await blob.arrayBuffer()));
    else if (x.kind === 'video') view.innerHTML = `<video src="${url}" controls playsinline preload="metadata" class="lib-video"></video>`;
    else if (x.kind === 'ses') view.innerHTML = `<div class="lib-audio"><i class="ti ti-headphones" aria-hidden="true"></i><audio src="${url}" controls preload="metadata"></audio>
        <div class="chips" role="group" aria-label="Hız">${[1, 1.25, 1.5, 2].map(r => `<button type="button" class="chip" data-rate="${r}" aria-pressed="${r === 1}">${String(r).replace('.', ',')}×</button>`).join('')}</div></div>`;
    else if (x.kind === 'gorsel') view.innerHTML = `<img src="${url}" alt="${esc(x.title)}" class="lib-img">`;
    else if (x.kind === 'html') {
      view.innerHTML = '<div class="embed html"><iframe sandbox="allow-scripts allow-popups allow-forms" title="' + esc(x.title) + '"></iframe></div>';
      view.querySelector('iframe').srcdoc = await blob.text();
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
  const path = requiredPath(published().filter(i => i.published), libDone());
  toast(score != null ? `Tamamlandı: %${score}.` : 'Tamamlandı olarak işaretlendi.');
  if (x.required && path.total && path.done === path.total) toast('Öğrenme yolunun tamamını bitirdin!');
  draw();
}

// ---------------- Klasör işlemleri (sahip / lider) ----------------
function folderForm(f = null) {
  const parent = f ? f.parent_id : s.folder;
  const d = el.querySelector('#a-dialog');
  d.innerHTML = `<form data-form="folder" data-id="${f ? f.id : ''}" novalidate>
    <header class="sheet-head"><h2 id="a-dialog-title">${f ? 'Klasörü düzenle' : parent ? `"${esc(folderName(parent))}" içine alt klasör` : 'Yeni klasör'}</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><label for="f-name">Klasör adı *</label><input id="f-name" name="name" maxlength="80" value="${esc(f?.name || '')}" placeholder="Ör. Patch ürünleri"></div>
      <div class="field"><span class="label">Renk</span><div class="chips" role="radiogroup" aria-label="Renk">${Object.entries(FOLDER_COLORS).map(([k, l]) =>
        `<label class="chip radio-chip"><input type="radio" name="color" value="${k}" ${k === (f?.color || (parent ? s.folders.find(x => x.id === parent)?.color : 'gold')) ? 'checked' : ''}><i class="ti ti-folder c-${k}" aria-hidden="true"></i>${l}</label>`).join('')}</div></div>
      ${f ? `<div class="field"><label for="f-parent">Üst klasör</label><select id="f-parent" name="parent">
        <option value="">Kütüphane (en üst)</option>
        ${flatTree(s.folders).filter(x => !descendantIds(s.folders, f.id).has(x.id)).map(x => `<option value="${x.id}" ${x.id === f.parent_id ? 'selected' : ''}>${'— '.repeat(x.depth)}${esc(x.name)}</option>`).join('')}
      </select></div>` : ''}
      <div class="field"><label for="f-sort">Sıra</label><input id="f-sort" name="sort" type="number" min="0" max="9999" value="${esc(f?.sort ?? 100)}"></div>
      <p class="error" id="f-error" role="alert"></p>
    </div>
    <footer class="sheet-foot">
      ${f ? `<button type="button" class="btn btn-ghost" data-act="folder-del" data-id="${f.id}">Sil</button>` : ''}
      <button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  if (!d.open) d.showModal();
  d.querySelector('#f-name').focus();
}
async function saveFolder(form) {
  const id = form.dataset.id, err = form.querySelector('#f-error');
  const name = form.elements.name.value.trim();
  if (!name) { err.textContent = 'Klasör adı yaz.'; return; }
  const row = { name, color: form.elements.color.value || 'gold', sort: +form.elements.sort.value || 100 };
  if (id) row.parent_id = form.elements.parent.value || null;
  const parentId = id ? row.parent_id : s.folder;
  row.category = parentId ? rootCategory(s.folders, parentId) : (s.folders.find(f => f.id === id)?.category || 'diger');
  const q = id ? supabase.from('academy_folders').update(row).eq('id', id).select().single()
    : supabase.from('academy_folders').insert({ ...row, org_id: ctx.org.id, parent_id: s.folder || null }).select().single();
  const { data, error } = await q;
  if (error) { err.textContent = trError(error); return; }
  s.folders = id ? s.folders.map(f => (f.id === id ? data : f)) : [...s.folders, data];
  el.querySelector('#a-dialog').close();
  if (!id) s.folder = data.id;
  toast(id ? 'Klasör güncellendi.' : 'Klasör oluşturuldu.'); draw();
}
async function delFolder(id) {
  const ids = descendantIds(s.folders, id);
  const n = s.items.filter(x => x.folder_id && ids.has(x.folder_id)).length;
  if (!confirm(`"${folderName(id)}" ve alt klasörleri silinsin mi?${n ? ` İçindeki ${n} materyal silinmez, "Kütüphane" en üstüne taşınır.` : ''}`)) return;
  const { error } = await supabase.from('academy_folders').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  s.folders = s.folders.filter(f => !ids.has(f.id));
  s.items = s.items.map(x => (x.folder_id && ids.has(x.folder_id) ? { ...x, folder_id: null } : x));
  if (s.folder && ids.has(s.folder)) s.folder = null;
  el.querySelector('#a-dialog').close(); toast('Klasör silindi.'); draw();
}

// ---------------- Yönetim (sahip / lider) ----------------
function viewAdmin() {
  const all = sortItems(s.items);
  return `<section class="card">
      <div class="card-head"><h2><i class="ti ti-books" aria-hidden="true"></i> Materyaller <span class="small muted">· ${all.length} materyal · ${s.folders.length} klasör</span></h2>
        <button class="btn btn-gold" data-act="item-new"><i class="ti ti-plus" aria-hidden="true"></i> Materyal ekle</button></div>
      <p class="small muted">Klasörleri düzenlemek için Kütüphane sekmesini kullan. Burada tüm materyaller tek listede.</p>
      ${all.length ? `<ul class="entry-list admin-list">${all.map(x => `<li><button class="link-btn" data-act="item-edit" data-id="${x.id}">
          <i class="ti ${KINDS[x.kind]?.icon}" aria-hidden="true"></i> ${esc(x.title)}</button>
          <span class="small muted">${esc(x.folder_id ? folderPath(s.folders, x.folder_id).map(f => f.name).join(' › ') : 'Kütüphane')}${x.required ? ' · Zorunlu' : ''}${x.published ? '' : ' · Taslak'}</span></li>`).join('')}</ul>` : ''}
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

// ---------------- Materyal formu ----------------
let rec = null; // ses kaydı { mr, chunks, blob, url, t0, timer }
function itemForm(x = null) {
  const v = x || { kind: 'pdf', folder_id: s.folder || null, level: 'baslangic', required: false, published: true, sort: 100 };
  const d = el.querySelector('#a-dialog');
  stopRec(true);
  d.innerHTML = `<form data-form="item" data-id="${x ? x.id : ''}" novalidate>
    <header class="sheet-head"><h2 id="a-dialog-title">${x ? 'Materyali düzenle' : 'Materyal ekle'}</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><span class="label">Tür</span><div class="chips" role="radiogroup" aria-label="Materyal türü">${Object.entries(KINDS).map(([k, t]) =>
        `<label class="chip radio-chip"><input type="radio" name="kind" value="${k}" ${k === v.kind ? 'checked' : ''}><i class="ti ${t.icon}" aria-hidden="true"></i>${esc(t.label)}</label>`).join('')}</div></div>
      <div class="field"><label for="i-folder">Klasör</label><select id="i-folder" name="folder">
        <option value="">Kütüphane (en üst)</option>
        ${flatTree(s.folders).map(f => `<option value="${f.id}" ${f.id === v.folder_id ? 'selected' : ''}>${'— '.repeat(f.depth)}${esc(f.name)}</option>`).join('')}
      </select></div>
      <div class="field kind-file"><label for="i-file">Dosya ${x?.file_name ? `(şu an: ${esc(x.file_name)})` : ''}</label><input id="i-file" name="file" type="file">
        <span class="small muted">En fazla 50 MB. Büyük videolar için YouTube'a "liste dışı" yükleyip "Bağlantı" türünü kullan.</span></div>
      <div class="field kind-rec"><span class="label">ya da şimdi kaydet</span>
        <div class="quick"><button type="button" class="btn btn-ghost" data-act="rec"><i class="ti ti-microphone" aria-hidden="true"></i> <span id="rec-l">Kayda başla</span></button>
          <span class="small muted" id="rec-t"></span></div><div id="rec-out"></div></div>
      <div class="field kind-link"><label for="i-url" id="i-url-l">Bağlantı</label><input id="i-url" name="url" type="url" value="${esc(v.url || '')}" placeholder="https://">
        <span class="small muted" id="i-url-h"></span></div>
      <div class="field"><label for="i-title">Başlık *</label><input id="i-title" name="title" maxlength="160" value="${esc(v.title || '')}"></div>
      <div class="field"><label for="i-sum">Kısa açıklama</label><textarea id="i-sum" name="summary" rows="2" maxlength="600">${esc(v.summary || '')}</textarea></div>
      <div class="form-2">
        <div class="field"><label for="i-lvl">Seviye</label><select id="i-lvl" name="level">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${k === v.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="i-min">Süre (dakika)</label><input id="i-min" name="minutes" type="number" min="1" max="600" value="${esc(v.minutes ?? '')}"></div>
      </div>
      <div class="field"><label for="i-body">${v.kind === 'yazi' ? 'Metin *' : 'Notlar (isteğe bağlı)'}</label>
        <textarea id="i-body" name="body" rows="8" maxlength="20000" placeholder="Boş satır = yeni paragraf · '- ' ile madde · '## ' ile ara başlık">${esc(v.body || '')}</textarea></div>
      <div class="form-2">
        <label class="inline-check"><input type="checkbox" name="required" ${v.required ? 'checked' : ''}> Zorunlu (öğrenme yoluna eklenir)</label>
        <label class="inline-check"><input type="checkbox" name="published" ${v.published ? 'checked' : ''}> Yayında</label>
      </div>
      <div class="field"><label for="i-sort">Sıra</label><input id="i-sort" name="sort" type="number" min="0" max="9999" value="${esc(v.sort ?? 100)}"></div>
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
  form.querySelector('.kind-file').hidden = !FILE_KINDS.includes(kind);
  form.querySelector('.kind-rec').hidden = kind !== 'ses';
  form.querySelector('.kind-link').hidden = !URL_KINDS.includes(kind);
  form.elements.file.accept = KINDS[kind].accept;
  form.querySelector('#i-url-l').textContent = kind === 'drive' ? 'Google Drive bağlantısı (dosya, klasör, doküman, tablo ya da sunum)' : 'Bağlantı (YouTube, Vimeo, Spotify ya da web sayfası)';
  form.querySelector('#i-url-h').textContent = kind === 'drive' ? 'Drive\'da dosyaya sağ tıkla → Paylaş → "Bağlantıya sahip olan herkes görüntüleyebilir" → Bağlantıyı kopyala.' : '';
  form.querySelector('label[for="i-body"]').textContent = kind === 'yazi' ? 'Metin *' : 'Notlar (isteğe bağlı)';
}

async function toggleRec(btn) {
  if (rec?.mr?.state === 'recording') { rec.mr.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec = { mr, chunks: [], t0: Date.now() };
    mr.ondataavailable = e => e.data.size && rec.chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(rec.timer);
      const mime = (mr.mimeType || 'audio/webm').split(';')[0];
      rec.blob = new Blob(rec.chunks, { type: mime }); rec.url = URL.createObjectURL(rec.blob);
      const out = el.querySelector('#rec-out'); if (out) out.innerHTML = `<audio src="${rec.url}" controls></audio><p class="small muted">Kayıt hazır; "Kaydet" ile yüklenir.</p>`;
      const l = el.querySelector('#rec-l'); if (l) l.textContent = 'Yeniden kaydet';
    };
    mr.start(1000);
    rec.timer = setInterval(() => { const t = el.querySelector('#rec-t'); if (t) { const n = Math.round((Date.now() - rec.t0) / 1000); t.textContent = `● ${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; } }, 500);
    btn.querySelector('#rec-l').textContent = 'Kaydı bitir';
  } catch { toast('Mikrofona erişilemedi; tarayıcı iznini kontrol et.'); }
}
function stopRec(reset = false) {
  if (rec?.mr?.state === 'recording') rec.mr.stop();
  if (reset) rec = null;
}

async function saveItem(form) {
  const f = n => form.elements[n];
  const err = form.querySelector('#i-error');
  const id = form.dataset.id, old = s.items.find(i => i.id === id);
  const kind = f('kind').value;
  let file = f('file').files[0];
  if (!file && kind === 'ses' && rec?.blob) {
    const ext = rec.blob.type.includes('mp4') ? 'm4a' : 'webm';
    file = new File([rec.blob], `ses-kaydi-${new Date().toISOString().slice(0, 10)}.${ext}`, { type: rec.blob.type });
  }
  const folderId = f('folder').value || null;
  const row = {
    kind, folder_id: folderId, category: folderId ? rootCategory(s.folders, folderId) : 'diger',
    title: f('title').value.trim(), summary: f('summary').value.trim() || null, level: f('level').value,
    minutes: f('minutes').value ? +f('minutes').value : null, sort: f('sort').value ? +f('sort').value : 100,
    body: f('body').value.trim() || null, required: f('required').checked, published: f('published').checked,
    url: URL_KINDS.includes(kind) ? f('url').value.trim() : null
  };
  const qt = f('quiz').value.trim();
  row.quiz = qt ? parseQuizText(qt) : null;
  if (row.title.length < 2) { err.textContent = 'Başlık yaz.'; return; }
  if (URL_KINDS.includes(kind) && !/^https?:\/\//i.test(row.url || '')) { err.textContent = 'Geçerli bir bağlantı gir (https://…).'; return; }
  if (kind === 'drive' && !driveInfo(row.url)) { err.textContent = 'Bu bir Google Drive / Dokümanlar bağlantısı değil. Diğer bağlantılar için "Bağlantı" türünü seç.'; return; }
  if (kind === 'yazi' && !row.body) { err.textContent = 'Metni yaz.'; return; }
  if (qt && !row.quiz) { err.textContent = 'Quiz biçimi okunamadı: her soruda en az 2 seçenek ve * ile işaretli bir doğru cevap olmalı.'; return; }
  const needsFile = FILE_KINDS.includes(kind);
  if (needsFile && !file && !(old?.file_path && old.kind === kind)) { err.textContent = kind === 'ses' ? 'Ses dosyası seç ya da kaydet.' : 'Dosya seç.'; return; }
  if (file) {
    if (kindFromFile(file) !== kind) { err.textContent = `Seçtiğin dosya ${KINDS[kind].label} değil.`; return; }
    if (file.size > 50 * 1048576) { err.textContent = 'Dosya 50 MB\'tan büyük. Videoyu YouTube\'a "liste dışı" ya da Drive\'a yükleyip bağlantı olarak ekleyebilirsin.'; return; }
  }
  err.textContent = file ? 'Dosya yükleniyor…' : '';
  try {
    if (file) {
      const ext = (file.name.split('.').pop() || kind).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
      const path = `${ctx.org.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('akademi').upload(path, file, { contentType: mimeOf(file.name, file.type) });
      if (up.error) throw new Error(trError(up.error));
      Object.assign(row, { file_path: path, file_name: file.name.slice(0, 160), file_size: file.size });
    } else if (!needsFile) Object.assign(row, { file_path: null, file_name: null, file_size: null });
    const q = id ? supabase.from('academy_items').update(row).eq('id', id).select().single()
      : supabase.from('academy_items').insert({ ...row, org_id: ctx.org.id }).select().single();
    const { data, error } = await q;
    if (error) throw new Error(trError(error));
    if (old?.file_path && old.file_path !== data.file_path) await supabase.storage.from('akademi').remove([old.file_path]);
    s.items = id ? s.items.map(i => (i.id === id ? data : i)) : [...s.items, data];
    stopRec(true);
    el.querySelector('#a-dialog').close();
    if (!s.q) s.folder = data.folder_id;
    toast(id ? 'Materyal güncellendi.' : 'Materyal eklendi.');
    draw();
  } catch (e) { err.textContent = e.message; }
}

async function delItem(id) {
  const x = s.items.find(i => i.id === id);
  if (!x || !confirm(`"${x.title}" silinsin mi?`)) return;
  const { error } = await supabase.from('academy_items').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  if (x.file_path) await supabase.storage.from('akademi').remove([x.file_path]);
  s.items = s.items.filter(i => i.id !== id);
  el.querySelector('#a-dialog').close(); toast('Silindi.'); draw();
}

async function quizAi(btn) {
  const form = btn.closest('form');
  const x = s.items.find(i => i.id === form.dataset.id);
  let text = [form.elements.title.value, form.elements.summary.value, form.elements.body.value].join('\n\n');
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Hazırlanıyor…';
  try {
    if (x?.kind === 'pdf' && x.file_path && text.trim().length < 400) {
      const lib = await loadPdfLib();
      const doc = await lib.getDocument({ data: new Uint8Array(await (await fileBlob(x)).arrayBuffer()) }).promise;
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
    const pos = e.target.selectionStart;
    draw();
    const inp = el.querySelector('#lib-q'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
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
  const fo = e.target.closest('[data-folder]');
  if (fo) { s.folder = fo.dataset.folder || null; s.q = ''; history.replaceState(null, '', `#/akademi?tab=kutuphane${s.folder ? '&klasor=' + s.folder : ''}`); draw(); return; }
  const rate = e.target.closest('[data-rate]');
  if (rate) { const a = el.querySelector('#lib-view audio'); if (a) a.playbackRate = +rate.dataset.rate; rate.parentElement.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-pressed', b === rate)); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const aid = e.target.closest('[data-act]')?.dataset.id;
  if (act === 'item-new') { itemForm(); return; }
  if (act === 'item-edit') { itemForm(s.items.find(i => i.id === aid)); return; }
  if (act === 'item-del') { delItem(aid); return; }
  if (act === 'quiz-ai') { quizAi(e.target.closest('[data-act]')); return; }
  if (act === 'folder-new') { folderForm(); return; }
  if (act === 'folder-edit') { folderForm(s.folders.find(f => f.id === aid)); return; }
  if (act === 'folder-del') { delFolder(aid); return; }
  if (act === 'lib-tab') { openInTab(s.items.find(i => i.id === aid)); return; }
  if (act === 'lib-dl') { downloadItem(s.items.find(i => i.id === aid)); return; }
  if (act === 'rec') { toggleRec(e.target.closest('[data-act]')); return; }
  if (act === 'close') { stopRec(true); el.querySelector('#a-dialog').close(); draw(); }
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
  if (form.dataset.form === 'folder') { const b = form.querySelector('[type=submit]'); b.disabled = true; await saveFolder(form); b.disabled = false; return; }
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

