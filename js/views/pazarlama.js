// Pazarlama birimi: içerik takvimi, caption fikirleri, web sitesi aday formu, Instagram'dan hızlı aday
import { supabase } from '../supabase.js';
import { esc, toast, trError, todayISO } from '../ui.js';
import { PILLARS, pillarLabel, FORMATS, PLATFORMS, POST_STATUS, IDEAS } from '../pazarlama/content.js';
import { checkMessage } from '../iletisim/uyum.js';

const TABS = [
  { id: 'takvim', label: 'İçerik takvimi', icon: 'ti-calendar' },
  { id: 'fikir', label: 'Fikirler', icon: 'ti-bulb' },
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
  el.querySelector('#p-body').innerHTML = { takvim: viewCalendar, fikir: viewIdeas, form: viewForm, instagram: viewInstagram }[s.tab]();
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
      <button type="button" class="btn btn-ghost" data-act="copy-cap">Caption'ı kopyala</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  d.showModal();
  updateCheck();
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
    case 'copy-cap': navigator.clipboard.writeText(el.querySelector('#c-cap').value).then(() => toast('Caption kopyalandı.')); break;
    case 'del-post': delPost(b, id); break;
    case 'create-form': createForm(b); break;
  }
}
function onInput(e) { if (e.target.id === 'c-cap') updateCheck(); }

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
