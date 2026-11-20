// Pazarlama birimi: içerik takvimi, caption fikirleri, Reels Stüdyosu, web sitesi aday formu, Instagram'dan hızlı aday
import { supabase } from '../supabase.js';
import { esc, toast, trError, todayISO } from '../ui.js';
import { PILLARS, pillarLabel, FORMATS, PLATFORMS, POST_STATUS, IDEAS } from '../pazarlama/content.js';
import { checkMessage } from '../iletisim/uyum.js';
import { aiChat, aiAvailable, ETHICS, extractJSON } from '../ai/client.js';
import { TEMPLATES, SCENE_COUNT, REEL_TOTAL, defaultStoryboard, normalizeStoryboard, normalizeHandle, normalizeKeyword,
  reelFindings, aiStoryboardPrompt, parseAiStoryboard, suggestCaption, reelSupport, drawReelFrame, previewTime,
  loadClip, releaseClips, loadReelFonts, renderReel, reelFileName } from '../pazarlama/reels.js';

const TABS = [
  { id: 'takvim', label: 'İçerik takvimi', icon: 'ti-calendar' },
  { id: 'fikir', label: 'Fikirler', icon: 'ti-bulb' },
  { id: 'reels', label: 'Reels', icon: 'ti-movie' },
  { id: 'form', label: 'Aday formu', icon: 'ti-forms' },
  { id: 'instagram', label: 'Instagram', icon: 'ti-brand-instagram' }
];
const NEXT_STATUS = { fikir: 'taslak', taslak: 'hazir', hazir: 'paylasildi', paylasildi: 'fikir' };
let el, ctx, s;

export async function renderPazarlama(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  s = { tab: TABS.some(t => t.id === tab) ? tab : 'takvim', pillar: '' };
  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Aday ve büyüme</div><h1>Pazarlama</h1>
        <p class="muted">İnsanlar insanı takip eder. Plansız paylaşım yerine haftalık içerik ritmi.</p></div>
      <button class="btn btn-gold" data-act="new-post"><i class="ti ti-plus" aria-hidden="true"></i> İçerik planla</button>
    </div>
    <div class="seg" role="tablist" aria-label="Pazarlama sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="p-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>
    <dialog id="p-dialog" class="sheet" aria-labelledby="p-dialog-title"></dialog>`;
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
  initReel();
  // AI hazır mı? (diyalog açılmadan önce biliniyor olsun)
  s.ai = await aiAvailable();

  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [posts, forms, webLeads] = await Promise.all([
    supabase.from('content_posts').select('*').gte('planned_for', from).order('planned_for').limit(500),
    supabase.from('lead_forms').select('*').eq('owner_id', ctx.user.id).order('created_at'),
    supabase.from('prospects').select('id, full_name, created_at').eq('source', 'Web sitesi').is('deleted_at', null).order('created_at', { ascending: false }).limit(20)
  ]);
  for (const r of [posts, forms, webLeads]) if (r.error) throw r.error;
  s.posts = posts.data; s.forms = forms.data; s.webLeads = webLeads.data;
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  el.querySelector('#p-body').innerHTML = { takvim: viewCalendar, fikir: viewIdeas, reels: viewReels, form: viewForm, instagram: viewInstagram }[s.tab]();
  if (s.tab === 'reels') afterReelDraw();
}

// ====================================================================
// İçerik takvimi: önümüzdeki 14 gün + sütun dengesi
function viewCalendar() {
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const key = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const upcoming = s.posts.filter(p => p.planned_for >= todayISO());
  const mix = Object.fromEntries(PILLARS.map(p => [p.id, 0]));
  upcoming.forEach(p => { if (p.pillar in mix) mix[p.pillar]++; });
  const total = upcoming.length || 1;
  const overdue = s.posts.filter(p => p.planned_for < todayISO() && p.status !== 'paylasildi');
  return `
    <section class="card">
      <h2><i class="ti ti-chart-pie" aria-hidden="true"></i> İçerik dengesi (planlananlar)</h2>
      <div class="mix">${PILLARS.map(p => `<div class="mix-row"><span>${esc(p.label)}</span>
        <div class="meter"><span style="width:${Math.round((mix[p.id] / total) * 100)}%"></span></div>
        <span class="small muted">${mix[p.id]} · hedef %${p.share}</span></div>`).join('')}</div>
      <p class="small muted">Her gönderiyi satış çağrısına çevirme. Ekip ve iş içerikleri toplamın %10'u civarında kalsın.</p>
    </section>
    ${overdue.length ? `<section class="card" style="margin-top:16px"><h2><i class="ti ti-alert-circle" aria-hidden="true"></i> Bekleyenler</h2>
      ${overdue.map(postRow).join('')}</section>` : ''}
    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-calendar" aria-hidden="true"></i> Önümüzdeki 14 gün</h2>
      <div class="cal-days">${days.map(d => {
        const list = s.posts.filter(p => p.planned_for === key(d));
        return `<div class="cal-day ${list.length ? '' : 'empty'}">
          <div class="cal-date"><strong>${d.getDate()}</strong><span>${esc(d.toLocaleDateString('tr-TR', { weekday: 'short' }))}</span></div>
          <div class="cal-items">${list.map(postRow).join('') || `<button class="link-btn" data-act="new-post" data-date="${key(d)}">+ içerik ekle</button>`}</div></div>`;
      }).join('')}</div>
    </section>`;
}

function postRow(p) {
  return `<div class="post-row">
    <button class="post-main" data-act="edit-post" data-id="${p.id}">
      <strong>${esc(p.topic)}</strong>
      <span class="small muted">${esc(p.platform)} · ${esc(FORMATS[p.format])} · ${esc(pillarLabel(p.pillar))}</span></button>
    <button class="chip st-${p.status}" data-act="cycle" data-id="${p.id}" title="Durumu ilerlet">${POST_STATUS[p.status]}</button>
  </div>`;
}

function postDialog(p = null, preset = {}) {
  const v = p || { platform: 'Instagram', format: 'gonderi', pillar: 'yasam', status: 'fikir', planned_for: todayISO(), ...preset };
  const d = el.querySelector('#p-dialog');
  d.innerHTML = `<form data-form="post" data-id="${p ? p.id : ''}" novalidate>
    <header class="sheet-head"><h2 id="p-dialog-title">${p ? 'İçeriği düzenle' : 'İçerik planla'}</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><label for="c-topic">Konu *</label><input id="c-topic" name="topic" maxlength="200" value="${esc(v.topic)}" autofocus></div>
      <div class="form-2">
        <div class="field"><label for="c-date">Tarih *</label><input id="c-date" name="planned_for" type="date" value="${esc(v.planned_for)}"></div>
        <div class="field"><label for="c-plat">Platform</label><select id="c-plat" name="platform">${PLATFORMS.map(x => `<option ${x === v.platform ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      </div>
      <div class="form-2">
        <div class="field"><label for="c-fmt">Format</label><select id="c-fmt" name="format">${Object.entries(FORMATS).map(([k, l]) => `<option value="${k}" ${k === v.format ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="c-pil">İçerik sütunu</label><select id="c-pil" name="pillar">${PILLARS.map(x => `<option value="${x.id}" ${x.id === v.pillar ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="c-cap">Caption</label><textarea id="c-cap" name="caption" rows="5" maxlength="2200">${esc(v.caption)}</textarea>
        <span class="small muted" id="c-count">${(v.caption || '').length}/2200</span></div>
      <div id="c-check"></div>
      <div class="field"><label for="c-st">Durum</label><select id="c-st" name="status">${Object.entries(POST_STATUS).map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="error" id="c-error" role="alert"></p>
    </div>
    <footer class="sheet-foot">
      ${p ? '<button type="button" class="btn btn-ghost" data-act="del-post" data-id="' + p.id + '">Sil</button>' : ''}
      ${p && p.storyboard ? '<button type="button" class="btn btn-ghost" data-act="reel-open" data-id="' + p.id + '"><i class="ti ti-movie" aria-hidden="true"></i> Stüdyoda aç</button>' : ''}
      ${s.ai ? '<button type="button" class="btn btn-ghost" data-act="ai-cap"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile yaz</button>' : ''}
      <button type="button" class="btn btn-ghost" data-act="copy-cap">Caption'ı kopyala</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  d.showModal();
  updateCheck();
}

async function aiCaption(btn) {
  const form = btn.closest('form');
  const f = n => form.elements.namedItem(n);
  const topic = f('topic').value.trim();
  const err = form.querySelector('#c-error');
  if (!topic) { err.textContent = 'Önce konuyu yaz.'; f('topic').focus(); return; }
  err.textContent = '';
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  const pillar = PILLARS.find(x => x.id === f('pillar').value);
  try {
    const text = await aiChat({ maxTokens: 600, messages: [{ role: 'user', content:
      `${f('platform').value} için ${FORMATS[f('format').value]} caption'ı yaz.
Konu: ${topic}
İçerik sütunu: ${pillar?.label} (${pillar?.hint})
Marka sesi: samimi ama profesyonel, gerçekçi, abartısız; sağlık ve kişisel gelişim alanında bir girişimci. Sloganlar: "Küçük ama istikrarlı adımlar", "Birlikte büyü" (her seferinde kullanma).
${ETHICS} Satış çağrısı yapma; sonunda etkileşim sorusu olsun.
${f('caption').value.trim() ? 'Mevcut taslağı geliştir:\n' + f('caption').value.trim() : ''}
Kurallar: 60-120 kelime, en fazla 3 emoji, sonunda 5-8 Türkçe/İngilizce alakalı hashtag. Sadece caption metnini yaz.` }] });
    f('caption').value = text.slice(0, 2200);
    updateCheck();
    toast('AI taslağı hazır; kendi sesine göre düzenle.');
  } catch (e) { err.textContent = 'AI: ' + e.message; }
  btn.disabled = false; btn.innerHTML = old;
}

function updateCheck() {
  const ta = el.querySelector('#c-cap');
  if (!ta) return;
  el.querySelector('#c-count').textContent = `${ta.value.length}/2200`;
  const f = checkMessage(ta.value);
  el.querySelector('#c-check').innerHTML = f.length ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}" — ${esc(x.tip)}</p>`).join('')}</div>`
    : (ta.value.trim() ? '<div class="check-box ok"><i class="ti ti-shield-check" aria-hidden="true"></i> Uyum kontrolü: sorun görünmüyor</div>' : '');
}

// ====================================================================
function viewIdeas() {
  const list = IDEAS.filter(i => !s.pillar || i.pillar === s.pillar);
  return `<div class="chips" role="group" aria-label="Sütun filtresi" style="margin-bottom:14px">
      <button class="chip" data-pillar="" aria-pressed="${!s.pillar}">Hepsi</button>
      ${PILLARS.map(p => `<button class="chip" data-pillar="${p.id}" aria-pressed="${s.pillar === p.id}">${esc(p.label)}</button>`).join('')}</div>
    <div class="grid lib-grid">${list.map(i => `<article class="card tpl-card">
      <header><h3>${esc(i.topic)}</h3><span class="badge">${esc(pillarLabel(i.pillar))}</span></header>
      <p class="tpl-text">${esc(i.caption)}</p>
      <footer><button class="btn btn-ghost" data-idea="${IDEAS.indexOf(i)}"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Takvime ekle</button></footer>
    </article>`).join('')}</div>
    <p class="small muted" style="margin-top:12px">Fikirleri kendi hayatına göre değiştir; kopyala-yapıştır içerik güven kazandırmaz.</p>`;
}

// ====================================================================
const formUrl = key => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}form.html?k=${key}`;

function viewForm() {
  const f = s.forms[0];
  if (!f) return `<div class="card empty"><i class="ti ti-forms" aria-hidden="true"></i><h2>Web sitesi aday formu</h2>
    <p class="muted">hakangedikli.com'a ya da Instagram profiline koyabileceğin bir form oluştur. Dolduran kişi KVKK onayıyla birlikte doğrudan Kazanım listene düşer.</p>
    <button class="btn btn-gold" data-act="create-form">Formumu oluştur</button></div>`;
  const url = formUrl(f.key);
  const embed = `<iframe src="${url}" style="width:100%;max-width:520px;height:640px;border:0" title="İletişim formu"></iframe>`;
  return `<div class="compose">
    <form class="card" data-form="lead-form" novalidate>
      <h2><i class="ti ti-forms" aria-hidden="true"></i> Form ayarları</h2>
      <div class="field"><label for="lf-title">Başlık</label><input id="lf-title" name="title" maxlength="120" value="${esc(f.title)}"></div>
      <div class="field"><label for="lf-intro">Açıklama</label><textarea id="lf-intro" name="intro" rows="3" maxlength="600" placeholder="Ör. Ürünleri ya da çalışma modelimi merak ediyorsan bilgilerini bırak, sana dönüş yapayım.">${esc(f.intro)}</textarea></div>
      <label class="check"><input type="checkbox" name="active" ${f.active ? 'checked' : ''}><span>Form yayında</span></label>
      <p class="error" id="lf-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Kaydet</button>
    </form>
    <section class="card">
      <h2><i class="ti ti-link" aria-hidden="true"></i> Paylaş</h2>
      <div class="field"><label for="lf-url">Form linki</label><input id="lf-url" readonly value="${esc(url)}"></div>
      <div class="quick"><button class="btn btn-ghost" data-copy="${esc(url)}"><i class="ti ti-copy" aria-hidden="true"></i> Linki kopyala</button>
        <a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Önizle</a></div>
      <div class="field" style="margin-top:14px"><label for="lf-embed">Web sitesine gömme kodu</label><textarea id="lf-embed" readonly rows="3">${esc(embed)}</textarea></div>
      <button class="btn btn-ghost" data-copy="${esc(embed)}"><i class="ti ti-code" aria-hidden="true"></i> Kodu kopyala</button>
      <h3 style="margin-top:18px">Formdan gelen son adaylar</h3>
      <ul class="entry-list">${s.webLeads.map(p => `<li><span>${esc(p.full_name)}</span><span class="small muted">${esc(new Date(p.created_at).toLocaleDateString('tr-TR'))}</span></li>`).join('') || '<li class="muted small">Henüz gelen yok.</li>'}</ul>
    </section></div>`;
}

// ====================================================================
function viewInstagram() {
  return `<div class="compose">
    <form class="card" data-form="ig" novalidate>
      <h2><i class="ti ti-brand-instagram" aria-hidden="true"></i> DM'den adaya</h2>
      <p class="small muted">Instagram'da güzel bir sohbet başladıysa kişiyi kaybetme: kaydet, takip tarihini belirle.</p>
      <div class="field"><label for="ig-handle">Kullanıcı adı *</label><input id="ig-handle" name="handle" placeholder="@kullanici"></div>
      <div class="field"><label for="ig-name">Ad soyad</label><input id="ig-name" name="name"></div>
      <div class="field"><label for="ig-note">Ne konuştunuz?</label><textarea id="ig-note" name="note" rows="2" placeholder="Ör. Sabah rutini paylaşımıma yorum yaptı, cilt bakımını sordu"></textarea></div>
      <label class="check"><input type="checkbox" name="kvkk"><span>Bilgilerini iletişim amacıyla kaydettiğimi kendisine söyledim (KVKK aydınlatma).</span></label>
      <p class="error" id="ig-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Adaylara ekle (takip: 2 gün sonra)</button>
    </form>
    <section class="card">
      <h2><i class="ti ti-bulb" aria-hidden="true"></i> Organik büyüme ritmi</h2>
      <ul class="feature-list">
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span>Her gün 10 dakika: takip ettiğin 5 kişinin paylaşımına içten bir yorum.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span>Gelen her yoruma ve DM'e aynı gün cevap ver.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span>Story'ye cevap veren kişiyle sohbeti sürdür; ilk mesajda iş anlatma.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span>Takip-bırak yapma; kalitesiz kitle erişimini düşürür.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span>Profil bağlantına aday formunu koy.</span></li>
      </ul>
    </section></div>`;
}

// ====================================================================
function onClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/pazarlama?tab=${s.tab}`); draw(); return; }
  const pil = t.closest('[data-pillar]');
  if (pil) { s.pillar = pil.dataset.pillar; draw(); return; }
  const idea = t.closest('[data-idea]');
  if (idea) { const i = IDEAS[+idea.dataset.idea]; postDialog(null, { topic: i.topic, caption: i.caption, pillar: i.pillar }); return; }
  const cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('Kopyalandı.'), () => toast('Kopyalanamadı; elle seç.')); return; }
  const b = t.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'new-post': postDialog(null, b.dataset.date ? { planned_for: b.dataset.date } : {}); break;
    case 'edit-post': postDialog(s.posts.find(p => p.id === id)); break;
    case 'close': el.querySelector('#p-dialog').close(); break;
    case 'cycle': cycle(id); break;
    case 'ai-cap': aiCaption(b); break;
    case 'copy-cap': navigator.clipboard.writeText(el.querySelector('#c-cap').value).then(() => toast('Caption kopyalandı.')); break;
    case 'del-post': delPost(b, id); break;
    case 'create-form': createForm(b); break;
    case 'reel-prev': s.reel.prev = +b.dataset.i; paintPreview(); markPrev(); break;
    case 'reel-ai': reelAi(b); break;
    case 'reel-render': reelRender(b); break;
    case 'reel-share': reelShare(); break;
    case 'reel-cal': reelToCalendar(b); break;
    case 'reel-open': reelOpen(id); break;
    case 'reel-new': reelNew(); break;
    case 'reel-clear': reelClearClip(+b.dataset.i); break;
  }
}
function onInput(e) {
  if (e.target.id === 'c-cap') updateCheck();
  if (e.target.dataset.reel) onReelInput(e.target);
}

async function cycle(id) {
  const p = s.posts.find(x => x.id === id);
  const { data, error } = await supabase.from('content_posts').update({ status: NEXT_STATUS[p.status] }).eq('id', id).select().single();
  if (error) { toast(trError(error)); return; }
  s.posts = s.posts.map(x => (x.id === id ? data : x)); draw();
}

async function delPost(btn, id) {
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.classList.add('btn-danger'); btn.textContent = 'Emin misin?'; return; }
  const { error } = await supabase.from('content_posts').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  s.posts = s.posts.filter(x => x.id !== id); el.querySelector('#p-dialog').close(); draw();
}

async function createForm(btn) {
  btn.disabled = true;
  const { data, error } = await supabase.from('lead_forms').insert({ org_id: ctx.org.id }).select().single();
  btn.disabled = false;
  if (error) { toast(trError(error)); return; }
  s.forms = [data]; draw(); toast('Formun hazır. Linki web sitene ya da profiline ekle.');
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (form.dataset.form === 'post') await savePost(form);
    if (form.dataset.form === 'lead-form') await saveLeadForm(form);
    if (form.dataset.form === 'ig') await saveIg(form);
  } finally { if (btn.isConnected) btn.disabled = false; }
}

async function savePost(form) {
  const f = n => form.elements.namedItem(n);
  const err = form.querySelector('#c-error');
  const topic = f('topic').value.trim();
  if (!topic) { err.textContent = 'Konu zorunlu.'; return; }
  if (!f('planned_for').value) { err.textContent = 'Tarih seç.'; return; }
  const risky = checkMessage(f('caption').value).filter(x => x.level === 'yuksek');
  const submit = form.querySelector('[type="submit"]');
  if (risky.length && submit.dataset.confirm !== '1') { submit.dataset.confirm = '1'; err.textContent = 'Caption\'da yüksek riskli ifade var. Yine de kaydetmek için tekrar dokun.'; return; }
  err.textContent = '';
  const row = { topic, planned_for: f('planned_for').value, platform: f('platform').value, format: f('format').value,
    pillar: f('pillar').value, caption: f('caption').value.trim() || null, status: f('status').value };
  const id = form.dataset.id;
  const q = id ? supabase.from('content_posts').update(row).eq('id', id).select().single()
    : supabase.from('content_posts').insert({ ...row, org_id: ctx.org.id }).select().single();
  const { data, error } = await q;
  if (error) { err.textContent = trError(error); return; }
  s.posts = (id ? s.posts.map(x => (x.id === id ? data : x)) : [...s.posts, data]).sort((a, b) => (a.planned_for < b.planned_for ? -1 : 1));
  el.querySelector('#p-dialog').close();
  s.tab = 'takvim'; draw(); toast('İçerik takvime eklendi.');
}

async function saveLeadForm(form) {
  const err = form.querySelector('#lf-error');
  const title = form.elements.namedItem('title').value.trim();
  if (!title) { err.textContent = 'Başlık boş olamaz.'; return; }
  const { data, error } = await supabase.from('lead_forms').update({
    title, intro: form.elements.namedItem('intro').value.trim() || null, active: form.elements.namedItem('active').checked
  }).eq('id', s.forms[0].id).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.forms = [data]; draw(); toast('Form güncellendi.');
}

async function saveIg(form) {
  const f = n => form.elements.namedItem(n);
  const err = form.querySelector('#ig-error');
  const handle = f('handle').value.trim().replace(/^@?/, '@');
  if (handle.length < 2) { err.textContent = 'Instagram kullanıcı adını yaz.'; return; }
  err.textContent = '';
  const follow = new Date(); follow.setDate(follow.getDate() + 2); follow.setHours(10, 0, 0, 0);
  const { data, error } = await supabase.from('prospects').insert({
    org_id: ctx.org.id, full_name: f('name').value.trim() || handle, instagram: handle, channel: 'Instagram', source: 'Sosyal medya',
    stage: 'temas', temperature: 'ilik', notes: f('note').value.trim() || null, next_follow_up_at: follow.toISOString()
  }).select().single();
  if (error) { err.textContent = trError(error); return; }
  if (f('kvkk').checked) await supabase.from('consents').insert({ org_id: ctx.org.id, prospect_id: data.id, kind: 'kvkk_aydinlatma', granted: true, method: 'Instagram DM' });
  await supabase.from('interactions').insert({ org_id: ctx.org.id, prospect_id: data.id, kind: 'mesaj', channel: 'Instagram', summary: f('note').value.trim() || 'Instagram DM' });
  form.reset();
  toast(`${data.full_name} adaylara eklendi, takip 2 gün sonra.`);
}

// ====================================================================
// Reels Stüdyosu: senaryo → klipler → telefonda video üretimi → kaydet/paylaş/takvime ekle
const brandKey = () => `nmd_reels_brand_${ctx.user.id}`;
function loadBrand() {
  try { return JSON.parse(localStorage.getItem(brandKey()) || '{}'); } catch { return {}; }
}
function saveBrand(sb) {
  try { localStorage.setItem(brandKey(), JSON.stringify({ handle: sb.handle, kw: sb.kw })); } catch { /* özel mod */ }
}
function initReel() {
  s.reel = { sb: defaultStoryboard(loadBrand()), topic: '', postId: null, media: new Array(SCENE_COUNT).fill(null),
    names: new Array(SCENE_COUNT).fill(''), prev: 0, out: null, busy: false, quality: 1080 };
}

function viewReels() {
  const r = s.reel, sb = r.sb, sup = reelSupport(window);
  const saved = s.posts.filter(p => p.storyboard).slice(-6).reverse();
  const tpl = TEMPLATES[sb.template];
  return `
    ${sup.ok ? '' : `<div class="check-box warn"><p><strong>Bu tarayıcı video üretemiyor.</strong> Telefonunuzda Chrome'un güncel sürümüyle açın.</p></div>`}
    ${sup.ok && !sup.mp4 ? `<div class="check-box warn"><p>Bu tarayıcı yalnızca WebM üretebiliyor; Instagram kabul etmeyebilir. Chrome'un güncel sürümünü deneyin.</p></div>` : ''}
    <div class="compose reel-compose">
      <section class="card reel-form">
        <h2><i class="ti ti-movie" aria-hidden="true"></i> ${r.postId ? 'Reels senaryosu (takvimden)' : 'Yeni Reels'}</h2>
        <p class="small muted">Şablon: <strong>${esc(tpl.label)}</strong>. ${esc(tpl.hint)} Kutularda 1. satır beyaz, 2. satır altın yazılır.</p>
        <div class="field"><label for="r-topic">Konu</label>
          <input id="r-topic" data-reel="topic" maxlength="200" value="${esc(r.topic)}" placeholder="Ör. İşimin yanında akşamlarım"></div>
        ${s.ai ? `<button type="button" class="btn btn-ghost" data-act="reel-ai"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile senaryo yaz</button>` : ''}
        <details class="reel-brand"${sb.handle ? '' : ' open'}><summary>Marka ayarları</summary>
          <div class="form-2">
            <div class="field"><label for="r-handle">Hesap adı</label><input id="r-handle" data-reel="handle" maxlength="31" value="${esc(sb.handle)}" placeholder="@kullaniciadi" autocapitalize="off"></div>
            <div class="field"><label for="r-kw">Yorum anahtar kelimesi</label><input id="r-kw" data-reel="kw" maxlength="16" value="${esc(sb.kw)}"></div>
          </div>
          <p class="small muted">Bu bilgiler sadece bu cihazda hatırlanır ve her videonun kapanışında görünür.</p>
        </details>
        ${sb.scenes.map((sc, i) => `<fieldset class="reel-scene">
          <legend>Sahne ${i + 1}</legend>
          <div class="field"><label for="r-top-${i}">Başlık</label><textarea id="r-top-${i}" data-reel="top" data-i="${i}" rows="2" maxlength="60">${esc(sc.top)}</textarea></div>
          <div class="field"><label for="r-bot-${i}">Alt yazı</label><textarea id="r-bot-${i}" data-reel="bot" data-i="${i}" rows="2" maxlength="70">${esc(sc.bot)}</textarea></div>
          <div class="reel-clip">
            <label class="btn btn-ghost" for="r-file-${i}"><i class="ti ti-video-plus" aria-hidden="true"></i> Klip seç</label>
            <input type="file" id="r-file-${i}" data-clip="${i}" accept="video/*,image/*" class="sr-only">
            <span class="small muted reel-clip-name" id="r-name-${i}">${esc(r.names[i] || 'Klip yok · örnek arka plan')}</span>
            ${r.media[i] ? `<button type="button" class="icon-btn" data-act="reel-clear" data-i="${i}" aria-label="Sahne ${i + 1} klibini kaldır"><i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
          </div>
        </fieldset>`).join('')}
        <fieldset class="reel-scene"><legend>Kapanış</legend>
          <div class="field"><label for="r-slogan">Slogan</label><textarea id="r-slogan" data-reel="slogan" rows="2" maxlength="60">${esc(sb.slogan)}</textarea></div>
          <div class="field"><label for="r-cta">Çağrı cümlesi</label><textarea id="r-cta" data-reel="cta" rows="2" maxlength="90">${esc(sb.cta)}</textarea></div>
        </fieldset>
        <div id="r-check"></div>
      </section>
      <section class="card reel-side">
        <h2><i class="ti ti-device-mobile" aria-hidden="true"></i> Önizleme</h2>
        <div class="reel-stage"><canvas id="r-canvas" width="540" height="960" aria-label="Video önizlemesi"></canvas></div>
        <div class="chips reel-prev-chips" role="group" aria-label="Önizlenecek sahne">
          ${[...sb.scenes.map((_, i) => `${i + 1}`), 'Slogan', 'Kapanış'].map((l, i) => `<button class="chip" data-act="reel-prev" data-i="${i}" aria-pressed="${r.prev === i}">${l}</button>`).join('')}
        </div>
        <div class="field"><label for="r-quality">Kalite</label>
          <select id="r-quality" data-reel="quality"><option value="1080" ${r.quality === 1080 ? 'selected' : ''}>1080 × 1920 (önerilen)</option><option value="720" ${r.quality === 720 ? 'selected' : ''}>720 × 1280 (eski telefonlar)</option></select></div>
        <div class="reel-bar" aria-hidden="true"><span id="r-prog"></span></div>
        <p class="small muted" id="r-status" role="status">${r.busy ? 'Üretiliyor…' : `Video ${Math.round(REEL_TOTAL)} sn sürer; üretim sırasında ekranı açık tutun.`}</p>
        <button type="button" class="btn btn-gold reel-go" data-act="reel-render" ${sup.ok && !r.busy ? '' : 'disabled'}><i class="ti ti-player-record" aria-hidden="true"></i> Videoyu üret</button>
        <div id="r-out">${reelOutHtml()}</div>
        <div class="quick" style="margin-top:12px">
          <button type="button" class="btn btn-ghost" data-act="reel-cal"><i class="ti ti-calendar-plus" aria-hidden="true"></i> ${r.postId ? 'Takvimde güncelle' : 'Takvime kaydet'}</button>
          <button type="button" class="btn btn-ghost" data-act="reel-new"><i class="ti ti-file-plus" aria-hidden="true"></i> Yeni senaryo</button>
        </div>
        <p class="error" id="r-error" role="alert"></p>
        ${saved.length ? `<h3 style="margin-top:18px">Kayıtlı senaryolar</h3>
          <ul class="entry-list">${saved.map(p => `<li><button class="link-btn" data-act="reel-open" data-id="${p.id}">${esc(p.topic)}</button>
            <span class="small muted">${esc(new Date(p.planned_for).toLocaleDateString('tr-TR'))} · ${POST_STATUS[p.status]}</span></li>`).join('')}</ul>` : ''}
      </section>
    </div>
    <p class="small muted" style="margin-top:12px">Klipler ve üretilen video telefonunuzda kalır, sunucuya yüklenmez. Müziği paylaşırken Instagram'ın müzik kütüphanesinden ekleyin.</p>`;
}

function reelOutHtml() {
  const o = s.reel.out;
  if (!o) return '';
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([o.blob], o.name, { type: o.blob.type })] }));
  return `<div class="reel-result">
    <video src="${o.url}" controls playsinline class="reel-video"></video>
    <p class="small muted">${o.ext.toUpperCase()} · ${o.width} × ${o.height} · ${(o.blob.size / 1048576).toFixed(1)} MB${o.drops > 60 ? ' · Takılma yüksek: 720 kaliteyi deneyin' : ''}</p>
    <div class="quick">
      <a class="btn btn-gold" href="${o.url}" download="${esc(o.name)}"><i class="ti ti-download" aria-hidden="true"></i> Telefona kaydet</a>
      ${canShare ? `<button type="button" class="btn btn-ghost" data-act="reel-share"><i class="ti ti-share" aria-hidden="true"></i> Paylaş</button>` : ''}
    </div></div>`;
}

function afterReelDraw() { updateReelCheck(); paintPreview(); }

let previewQueued = false;
async function paintPreview() {
  if (previewQueued) return;
  previewQueued = true;
  await loadReelFonts();
  requestAnimationFrame(() => {
    previewQueued = false;
    const cv = el.querySelector('#r-canvas');
    if (!cv || s.reel.busy) return;
    const i = s.reel.prev;
    // Önizlemede her sahnenin kendi klibi, o sahnenin anında gösterilir
    drawReelFrame(cv.getContext('2d'), cv.width, cv.height, previewTime(i), s.reel.media, s.reel.sb);
  });
}
function markPrev() {
  el.querySelectorAll('.reel-prev-chips [data-i]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === s.reel.prev));
}

function updateReelCheck() {
  const box = el.querySelector('#r-check');
  if (!box) return;
  const f = reelFindings(s.reel.sb);
  box.innerHTML = f.length ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}" — ${esc(x.tip)}</p>`).join('')}</div>`
    : '<div class="check-box ok"><i class="ti ti-shield-check" aria-hidden="true"></i> Uyum kontrolü: sorun görünmüyor</div>';
}

// Yazarken ekranı yeniden çizme: yalnızca durumu, uyum kutusunu ve önizlemeyi güncelle
function onReelInput(t) {
  const r = s.reel, k = t.dataset.reel, i = +t.dataset.i;
  if (k === 'topic') { r.topic = t.value; return; }
  if (k === 'quality') { r.quality = +t.value; return; }
  const raw = { ...r.sb, scenes: r.sb.scenes.map(x => ({ ...x })) };
  if (k === 'top' || k === 'bot') { raw.scenes[i][k] = t.value; r.prev = i; markPrev(); }
  else raw[k] = t.value;
  if (k === 'slogan') { r.prev = SCENE_COUNT; markPrev(); }
  if (k === 'cta' || k === 'kw' || k === 'handle') { r.prev = SCENE_COUNT + 1; markPrev(); }
  r.sb = normalizeStoryboard(raw);
  if (k === 'handle' || k === 'kw') saveBrand(r.sb);
  updateReelCheck(); paintPreview();
}

async function onChange(e) {
  const t = e.target;
  if (t.dataset.reel === 'quality') { s.reel.quality = +t.value; return; }
  if (t.dataset.reel === 'handle') { t.value = normalizeHandle(t.value); return; }
  if (t.dataset.reel === 'kw') { t.value = normalizeKeyword(t.value); return; }
  if (t.dataset.clip === undefined) return;
  const i = +t.dataset.clip, file = t.files && t.files[0];
  if (!file) return;
  const name = el.querySelector('#r-name-' + i);
  if (file.size > 300 * 1048576) { toast('Klip çok büyük (300 MB üstü). Daha kısa bir klip seçin.'); return; }
  if (name) name.textContent = 'Yükleniyor…';
  try {
    const m = await loadClip(file);
    releaseClips([s.reel.media[i]]);
    s.reel.media[i] = m; s.reel.names[i] = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    s.reel.prev = i;
    if (s.tab === 'reels') draw();
  } catch (err) { if (name) name.textContent = s.reel.names[i] || 'Klip yok · örnek arka plan'; toast(err.message); }
}

function reelClearClip(i) {
  releaseClips([s.reel.media[i]]);
  s.reel.media[i] = null; s.reel.names[i] = '';
  draw();
}

async function reelAi(btn) {
  const err = el.querySelector('#r-error');
  const topic = s.reel.topic.trim();
  if (!topic) { err.textContent = 'Önce konuyu yazın.'; el.querySelector('#r-topic')?.focus(); return; }
  err.textContent = '';
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  try {
    const text = await aiChat({ maxTokens: 700, messages: [{ role: 'user', content: aiStoryboardPrompt(topic, s.reel.sb) }] });
    s.reel.sb = parseAiStoryboard(extractJSON(text), s.reel.sb);
    s.reel.prev = 0; draw();
    toast('Senaryo hazır; kendi hayatınıza göre düzenleyin.');
  } catch (e) {
    const box = el.querySelector('#r-error'); if (box) box.textContent = 'AI: ' + e.message;
    btn.disabled = false; btn.innerHTML = old;
  }
}

async function reelRender(btn) {
  const r = s.reel, err = el.querySelector('#r-error');
  const risky = reelFindings(r.sb).filter(x => x.level === 'yuksek');
  if (risky.length && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; err.textContent = 'Metinde yüksek riskli ifade var. Düzeltin ya da yine de üretmek için tekrar dokunun.'; return; }
  err.textContent = ''; btn.dataset.confirm = '';
  if (r.out) { URL.revokeObjectURL(r.out.url); r.out = null; el.querySelector('#r-out').innerHTML = ''; }
  r.busy = true; btn.disabled = true;
  const status = () => el.querySelector('#r-status'), prog = () => el.querySelector('#r-prog');
  const onHide = () => { if (document.hidden && status()) status().textContent = 'Ekran kapandı ya da uygulama değişti; video eksik olabilir. Bitince yeniden üretin.'; };
  document.addEventListener('visibilitychange', onHide);
  if (status()) status().textContent = 'Üretiliyor… ekranı kapatmayın.';
  try {
    const canvas = el.querySelector('#r-canvas') || document.createElement('canvas');
    const res = await renderReel({ canvas, sb: r.sb, media: r.media, size: r.quality,
      onProgress: p => { const b = prog(); if (b) b.style.width = Math.round(p * 100) + '%'; } });
    const name = reelFileName(r.topic || r.sb.scenes[0].top, res.ext);
    r.out = { ...res, name, url: URL.createObjectURL(res.blob) };
    r.busy = false;
    if (s.tab === 'reels') draw();
    toast('Video hazır. Kaydedip Instagram\'da Reels olarak paylaşabilirsiniz.');
  } catch (e) {
    r.busy = false;
    if (s.tab === 'reels') { draw(); const x = el.querySelector('#r-error'); if (x) x.textContent = e.message; }
  } finally { document.removeEventListener('visibilitychange', onHide); }
}

async function reelShare() {
  const o = s.reel.out; if (!o) return;
  const file = new File([o.blob], o.name, { type: o.blob.type });
  try { await navigator.share({ files: [file], text: suggestCaption(s.reel.sb) }); }
  catch (e) { if (e.name !== 'AbortError') toast('Paylaşılamadı; önce telefona kaydedin.'); }
}

async function reelToCalendar(btn) {
  const r = s.reel, err = el.querySelector('#r-error');
  const risky = reelFindings(r.sb).filter(x => x.level === 'yuksek');
  if (risky.length && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; err.textContent = 'Metinde yüksek riskli ifade var. Yine de kaydetmek için tekrar dokunun.'; return; }
  err.textContent = ''; btn.disabled = true;
  const topic = (r.topic.trim() || r.sb.scenes[0].top.replace(/\n/g, ' ')).slice(0, 200);
  const row = { topic, format: 'reels', storyboard: r.sb };
  let q;
  if (r.postId) q = supabase.from('content_posts').update(row).eq('id', r.postId).select().single();
  else q = supabase.from('content_posts').insert({ ...row, org_id: ctx.org.id, planned_for: todayISO(), platform: 'Instagram',
    pillar: 'yasam', status: r.out ? 'hazir' : 'taslak', caption: suggestCaption(r.sb).slice(0, 2200) }).select().single();
  const { data, error } = await q;
  btn.disabled = false;
  if (error) { err.textContent = trError(error); return; }
  s.posts = (r.postId ? s.posts.map(x => (x.id === data.id ? data : x)) : [...s.posts, data]).sort((a, b) => (a.planned_for < b.planned_for ? -1 : 1));
  r.postId = data.id; r.topic = data.topic;
  draw();
  toast(r.out ? 'Reels takvime "Hazır" olarak kaydedildi.' : 'Senaryo takvime taslak olarak kaydedildi.');
}

function reelOpen(id) {
  const p = s.posts.find(x => x.id === id);
  if (!p || !p.storyboard) return;
  const dlg = el.querySelector('#p-dialog'); if (dlg?.open) dlg.close();
  if (s.reel.out) URL.revokeObjectURL(s.reel.out.url);
  s.reel.sb = normalizeStoryboard(p.storyboard); s.reel.topic = p.topic; s.reel.postId = p.id; s.reel.out = null; s.reel.prev = 0;
  s.tab = 'reels'; history.replaceState(null, '', '#/pazarlama?tab=reels'); draw();
}

function reelNew() {
  if (s.reel.busy) return;
  releaseClips(s.reel.media);
  if (s.reel.out) URL.revokeObjectURL(s.reel.out.url);
  const q = s.reel.quality;
  initReel(); s.reel.quality = q; draw();
}
