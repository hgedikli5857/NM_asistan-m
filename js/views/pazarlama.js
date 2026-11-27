// Pazarlama birimi: içerik takvimi, caption fikirleri, Reels Stüdyosu, web sitesi aday formu, Instagram'dan hızlı aday
import { supabase } from '../supabase.js';
import { esc, toast, trError, todayISO } from '../ui.js';
import { PILLARS, pillarLabel, FORMATS, PLATFORMS, POST_STATUS, IDEAS } from '../pazarlama/content.js';
import { checkMessage } from '../iletisim/uyum.js';
import { aiChat, aiAvailable, ETHICS, extractJSON } from '../ai/client.js';
import { TEMPLATES, defaultStoryboard, normalizeStoryboard, normalizeHandle, normalizeKeyword,
  reelFindings, aiStoryboardPrompt, parseAiStoryboard, suggestCaption, reelSupport, drawReelFrame, previewTime,
  loadClip, releaseClips, loadReelFonts, renderReel, reelFileName, blankStoryboard, parseScript, aiScriptPrompt, parseAiScript,
  fidelity, reelTotal, REEL_SCHEMA, MIN_SCENES, MAX_SCENES, SEC_MIN, SEC_MAX, SCENE_LEN, loadOutro, appendOutro, storyboardText } from '../pazarlama/reels.js';
import { planDays, weeklyQuota, buildHashtags, toolBrief, aiTopicsPrompt, TOOLS, DEFAULT_TIME, PLAN_FORMATS } from '../pazarlama/plan.js';
import { W, H, LAYOUTS, EMBLEMS, MIN_SLIDES, MAX_SLIDES, normalizeDeck, normalizeSlide, normalizeBrand, sampleDeck, deckFindings,
  parseDeckText, aiDeckPrompt, aiStructurePrompt, parseAiDeck, suggestCaptionK, drawSlide, renderDeck, loadDeckFonts,
  shrinkPhoto, shrinkLogo, imageFromData } from '../pazarlama/karusel.js';
import { appsScript } from '../pazarlama/gform.js';

const TABS = [
  { id: 'takvim', label: 'İçerik takvimi', icon: 'ti-calendar' },
  { id: 'fikir', label: 'Fikirler', icon: 'ti-bulb' },
  { id: 'reels', label: 'Reels', icon: 'ti-movie' },
  { id: 'karusel', label: 'Karusel', icon: 'ti-carousel-horizontal' },
  { id: 'gonderi', label: 'Gönderi', icon: 'ti-photo' },
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
  initKar();
  // AI hazır mı? (diyalog açılmadan önce biliniyor olsun)
  s.ai = await aiAvailable();

  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [posts, forms, webLeads, gLeads, gStat] = await Promise.all([
    supabase.from('content_posts').select('*').gte('planned_for', from).order('planned_for').limit(500),
    supabase.from('lead_forms').select('*').eq('owner_id', ctx.user.id).order('created_at'),
    supabase.from('prospects').select('id, full_name, created_at').eq('source', 'Web sitesi').is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    supabase.from('prospects').select('id, full_name, created_at').contains('tags', ['Google formu']).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    supabase.rpc('gform_status')
  ]);
  for (const r of [posts, forms, webLeads, gLeads]) if (r.error) throw r.error;
  s.posts = posts.data; s.forms = forms.data; s.webLeads = webLeads.data;
  s.gLeads = gLeads.data; s.gform = gStat.error ? null : gStat.data; s.gToken = null;
  const br = await supabase.from('content_brand').select('*').maybeSingle();
  s.brand = br.data || { post_time: DEFAULT_TIME };
  initGon();
  draw();
  const uret = new URLSearchParams(location.hash.split('?')[1] || '').get('uret');
  if (uret) produce(uret);
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  el.querySelector('#p-body').innerHTML = { takvim: viewCalendar, fikir: viewIdeas, reels: viewReels, karusel: viewKarusel, gonderi: viewGonderi, form: viewForm, instagram: viewInstagram }[s.tab]();
  if (s.tab === 'reels') afterReelDraw();
  if (s.tab === 'gonderi') gPaint();
  if (s.tab === 'karusel') kAfterDraw();
}

// ====================================================================
// İçerik takvimi: önümüzdeki 14 gün + sütun dengesi
// ====================================================================
// İçerik fabrikası: 30 günlük plan, marka kiti, "Oluştur"
const pubUrl = path => (path ? supabase.storage.from('icerik').getPublicUrl(path).data.publicUrl : '');
const hhmm = t => String(t || DEFAULT_TIME).slice(0, 5);
const TIME_OPTS = ['07:40', '07:45', '07:50', '08:00', '08:15', '08:30', '12:30', '19:30', '20:30', '21:00'];

function factoryCard() {
  const quota = weeklyQuota(s.posts, { days: 28 });
  const lbl = w => new Date(w.week + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const cell = (n, goal = 3) => `<span class="${n >= goal ? 'q-ok' : 'q-miss'}">${n}/${goal}</span>`;
  const futureAuto = s.posts.filter(p => p.auto_planned && p.status === 'fikir' && p.planned_for >= todayISO()).length;
  return `<section class="card fab-card">
    <h2><i class="ti ti-building-factory-2" aria-hidden="true"></i> İçerik fabrikası · 30 günlük plan</h2>
    <p class="small muted">Haftada 3 Reels, 3 Karusel, 3 Gönderi. Pazar: değerlendirme ve gelecek haftanın konularını onaylama günü. Konular değiştirilebilir; bir içeriğe dokunup düzenle.</p>
    <div class="table-wrap"><table class="quota"><thead><tr><th>Hafta</th><th>Reels</th><th>Karusel</th><th>Gönderi</th><th>Hazır</th></tr></thead>
      <tbody>${quota.map(w => `<tr><td>${esc(lbl(w))}</td><td>${cell(w.reels)}</td><td>${cell(w.karusel)}</td><td>${cell(w.gonderi)}</td><td>${w.hazir}/${w.reels + w.karusel + w.gonderi}</td></tr>`).join('')}</tbody></table></div>
    <div class="quick">
      <button class="btn btn-gold" data-act="plan-make"><i class="ti ti-calendar-plus" aria-hidden="true"></i> 30 günlük planı oluştur / tamamla</button>
      ${s.ai && futureAuto ? `<button class="btn btn-ghost" data-act="plan-ai"><i class="ti ti-sparkles" aria-hidden="true"></i> Konuları AI ile yenile (${futureAuto})</button>` : ''}
    </div>
    ${brandKitHtml()}
  </section>`;
}

function brandKitHtml() {
  const b = s.brand || {};
  return `<details class="brand-kit" ${b.logo_video_path ? '' : 'open'}><summary><i class="ti ti-badge" aria-hidden="true"></i> Marka kiti: logo, logo videosu, etiketler, paylaşım saati</summary>
    <form data-form="brand" novalidate>
      <div class="form-2">
        <div class="field"><label for="b-handle">Instagram hesabı</label><input id="b-handle" name="handle" maxlength="31" value="${esc(b.handle || '')}" placeholder="@h.gedikli.official" autocapitalize="off"></div>
        <div class="field"><label for="b-kw">Yorum anahtar kelimesi</label><input id="b-kw" name="kw" maxlength="16" value="${esc(b.kw || '')}" placeholder="GİRİŞİM"></div>
      </div>
      <div class="form-2">
        <div class="field"><label for="b-tags">Sabit hashtagler (her paylaşıma eklenir)</label><input id="b-tags" name="hashtags" maxlength="300" value="${esc(b.hashtags || '')}" placeholder="#hgedikli #birlikteburdayiz"></div>
        <div class="field"><label for="b-time">Varsayılan paylaşım saati</label><select id="b-time" name="post_time">${TIME_OPTS.map(t => `<option value="${t}" ${t === hhmm(b.post_time) ? 'selected' : ''}>${t}${t === '07:45' ? ' (önerilen)' : ''}</option>`).join('')}</select></div>
      </div>
      <div class="form-2">
        <div class="field"><span class="label">Logo (PNG, şeffaf)</span>
          <div class="quick">${b.logo_path ? `<img src="${esc(pubUrl(b.logo_path))}" alt="Logo" class="brand-thumb">` : ''}
          <label class="btn btn-ghost" for="b-logo"><i class="ti ti-upload" aria-hidden="true"></i> ${b.logo_path ? 'Değiştir' : 'Logo yükle'}</label>
          <input type="file" id="b-logo" accept="image/png,image/webp,image/jpeg" class="sr-only"></div></div>
        <div class="field"><span class="label">Logo animasyon videosu (videoların sonuna eklenir)</span>
          <div class="quick">${b.logo_video_path ? `<video src="${esc(pubUrl(b.logo_video_path))}" class="brand-thumb" muted playsinline loop autoplay></video>` : ''}
          <label class="btn btn-ghost" for="b-video"><i class="ti ti-video-plus" aria-hidden="true"></i> ${b.logo_video_path ? 'Değiştir' : 'Logo videosu yükle'}</label>
          <input type="file" id="b-video" accept="video/mp4,video/quicktime,video/webm" class="sr-only"></div>
          <span class="small muted">En fazla 50 MB; ilk 8 saniyesi kullanılır.</span></div>
      </div>
      <p class="error" id="b-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Marka kitini kaydet</button>
    </form></details>`;
}

async function saveBrandKit(form) {
  const f = n => form.elements.namedItem(n).value.trim();
  const row = { org_id: ctx.org.id, handle: normalizeHandle(f('handle')) || null, kw: f('kw') ? normalizeKeyword(f('kw')) : null,
    hashtags: f('hashtags') || null, post_time: f('post_time') || DEFAULT_TIME, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('content_brand').upsert({ owner_id: ctx.user.id, ...row }).select().single();
  if (error) { form.querySelector('#b-error').textContent = trError(error); return; }
  s.brand = data; outroCache = null;
  // Reels kapanışındaki hesap ve kelime de buradan gelsin
  s.reel.sb = normalizeStoryboard({ ...s.reel.sb, handle: data.handle || s.reel.sb.handle, kw: data.kw || s.reel.sb.kw });
  saveBrand(s.reel.sb);
  toast('Marka kiti kaydedildi.'); draw();
}

// Dosyayı kullanıcının klasörüne yükle → { path, url, type, name, size, at }
async function uploadMedia(fileOrBlob, { name = 'dosya', folder = 'icerik', ext = null, upsertPath = null } = {}) {
  const type = fileOrBlob.type || 'application/octet-stream';
  if (fileOrBlob.size > 50 * 1048576) throw new Error('Dosya 50 MB\'tan büyük. Daha düşük kalitede dışa aktarıp tekrar dene.');
  const e = ext || ({ 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type]) || 'bin';
  const path = upsertPath || `${ctx.user.id}/${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${e}`;
  const { error } = await supabase.storage.from('icerik').upload(path, fileOrBlob, { contentType: type, upsert: !!upsertPath, cacheControl: '3600' });
  if (error) throw new Error(trError(error));
  return { path, url: pubUrl(path) + (upsertPath ? `?v=${Date.now()}` : ''), type, name: String(name).slice(0, 80), size: fileOrBlob.size, at: new Date().toISOString() };
}

async function brandFile(kind, file) {
  if (!file) return;
  const ok = kind === 'logo' ? /^image\//.test(file.type) : /^video\//.test(file.type);
  if (!ok) { toast(kind === 'logo' ? 'Logo için PNG ya da JPEG seç.' : 'Logo videosu için MP4 ya da MOV seç.'); return; }
  toast('Yükleniyor…');
  try {
    const ext = kind === 'logo' ? (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg') : (file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : 'mp4');
    const m = await uploadMedia(file, { name: file.name, upsertPath: `${ctx.user.id}/brand/${kind === 'logo' ? 'logo' : 'logo-video'}.${ext}` });
    const col = kind === 'logo' ? 'logo_path' : 'logo_video_path';
    const { data, error } = await supabase.from('content_brand').upsert({ owner_id: ctx.user.id, org_id: ctx.org.id, ...(s.brand.owner_id ? {} : { post_time: s.brand.post_time || DEFAULT_TIME }), [col]: m.path, updated_at: new Date().toISOString() }).select().single();
    if (error) throw new Error(trError(error));
    s.brand = data; outroCache = null; logoCache = null;
    toast(kind === 'logo' ? 'Logo kaydedildi.' : 'Logo videosu kaydedildi; Reels\'lerin sonuna eklenecek.');
    draw();
  } catch (e) { toast(e.message); }
}

let outroCache = null, logoCache = null;
async function getOutro() {
  if (!s.brand?.logo_video_path) return null;
  if (!outroCache) outroCache = loadOutro(pubUrl(s.brand.logo_video_path) + `?v=${encodeURIComponent(s.brand.updated_at || '')}`).catch(e => { outroCache = null; throw e; });
  return outroCache;
}
async function getLogo() {
  if (!s.brand?.logo_path) return s.kar?.logo || null;
  if (!logoCache) {
    logoCache = fetch(pubUrl(s.brand.logo_path) + `?v=${encodeURIComponent(s.brand.updated_at || '')}`).then(r => r.blob())
      .then(b => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(b); }))
      .catch(() => { logoCache = null; return s.kar?.logo || null; });
  }
  return logoCache;
}

async function planMake(btn) {
  const add = planDays({ start: new Date(), days: 30, existing: s.posts, time: hhmm(s.brand?.post_time) });
  if (!add.length) { toast('Önümüzdeki 30 günün planı zaten tam.'); return; }
  const c = { reels: 0, karusel: 0, gonderi: 0 }; add.forEach(x => c[x.format]++);
  if (!confirm(`${add.length} içerik takvime eklenecek (Reels ${c.reels}, Karusel ${c.karusel}, Gönderi ${c.gonderi}). Konuları sonra değiştirebilirsin. Devam?`)) return;
  btn.disabled = true;
  const { data, error } = await supabase.from('content_posts').insert(add.map(x => ({ ...x, org_id: ctx.org.id }))).select();
  btn.disabled = false;
  if (error) { toast(trError(error)); return; }
  s.posts = [...s.posts, ...data].sort((a, b) => (a.planned_for < b.planned_for ? -1 : a.planned_for > b.planned_for ? 1 : 0));
  draw(); toast(`${data.length} içerik planlandı. Bugünün içeriği Ajanda ve Panel'de "Oluştur" ile açılır.`);
}

async function planAi(btn) {
  const items = s.posts.filter(p => p.auto_planned && p.status === 'fikir' && p.planned_for >= todayISO()).slice(0, 45);
  if (!items.length) return;
  if (!confirm(`${items.length} içeriğin konusu AI ile yenilenecek (yalnızca henüz başlanmamış ve otomatik planlananlar). Devam?`)) return;
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  try {
    const text = await aiChat({ maxTokens: 2000, messages: [{ role: 'user', content: aiTopicsPrompt(items) }] });
    const topics = (extractJSON(text)?.topics || []).map(t => String(t || '').trim().slice(0, 120));
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const t = topics[i];
      if (!t || checkMessage(t).some(x => x.level === 'yuksek')) continue;
      const { data, error } = await supabase.from('content_posts').update({ topic: t }).eq('id', items[i].id).select().single();
      if (!error) { s.posts = s.posts.map(x => (x.id === data.id ? data : x)); n++; }
    }
    draw(); toast(`${n} konu yenilendi.`);
  } catch (e) { toast('AI: ' + e.message); btn.disabled = false; btn.innerHTML = old; }
}

// Takvimden, Ajanda'dan ya da Panel'den "Oluştur": ilgili stüdyoyu konu dolu açar
function produce(id) {
  const p = s.posts.find(x => x.id === id);
  if (!p) { toast('İçerik bulunamadı (30 günden eski olabilir).'); return; }
  const dlg = el.querySelector('#p-dialog'); if (dlg?.open) dlg.close();
  if (p.format === 'reels') {
    if (p.storyboard) reelOpen(id);
    else {
      reelNew(true);
      Object.assign(s.reel, { postId: p.id, topic: p.topic, step: 'senaryo' });
      reelLoadPost(p);
      s.tab = 'reels'; history.replaceState(null, '', '#/pazarlama?tab=reels'); draw();
    }
    if (s.reel.mode === 'ai' && s.ai && !p.storyboard) toast('Konu hazır. "AI ile senaryo yaz"a dokun ya da "Benim metnim"e geç.');
    return;
  }
  if (p.format === 'karusel') {
    if (p.carousel) { kOpen(id); return; }
    kNew();
    s.kar.deck.topic = p.topic; s.kar.postId = p.id; s.kar.sample = true;
    s.tab = 'karusel'; history.replaceState(null, '', '#/pazarlama?tab=karusel'); draw();
    toast('Konu karusel stüdyosuna aktarıldı.');
    return;
  }
  if (p.format === 'gonderi') { gonOpen(p); return; }
  postDialog(p);
}

// Araç seçimi + dış araç akışı (Reels ve Gönderi için ortak)
function toolPicker(scope, tool) {
  return `<div class="tool-pick" role="radiogroup" aria-label="Üretim aracı">${Object.entries(TOOLS).map(([k, t]) =>
    `<button type="button" role="radio" aria-checked="${k === tool}" class="chip" data-act="tool" data-scope="${scope}" data-tool="${k}"><i class="ti ${t.icon}" aria-hidden="true"></i>${esc(t.label)}</button>`).join('')}</div>`;
}
function externalHtml(scope, { tool, brief, media, accept }) {
  const t = TOOLS[tool];
  return `<div class="ext-tool">
    <ol class="small">
      ${t.url ? `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.label)} uygulamasını aç <i class="ti ti-external-link" aria-hidden="true"></i></a>, aşağıdaki brief'i kullanarak üret.</li>` : '<li>İçeriği istediğin araçta üret; aşağıdaki brief yardımcı olur.</li>'}
      <li>Bitmiş dosyayı telefonuna indir.</li>
      <li>"Bitmiş dosyayı yükle" ile buraya ekle.</li>
    </ol>
    <div class="field"><label for="${scope}-brief">Brief (araca yapıştır)</label><textarea id="${scope}-brief" rows="6" readonly>${esc(brief)}</textarea></div>
    <div class="quick">
      <button type="button" class="btn btn-ghost" data-copy="${esc(brief)}"><i class="ti ti-copy" aria-hidden="true"></i> Brief'i kopyala</button>
      <label class="btn btn-primary" for="${scope}-upload"><i class="ti ti-upload" aria-hidden="true"></i> Bitmiş dosyayı yükle</label>
      <input type="file" id="${scope}-upload" data-media="${scope}" accept="${accept}" class="sr-only">
    </div>
    ${media ? `<p class="small muted"><i class="ti ti-check" aria-hidden="true"></i> Yüklendi: ${esc(media.name)} · ${(media.size / 1048576).toFixed(1)} MB</p>` : ''}
  </div>`;
}

// Açıklama + hashtag kutusu (Reels ve Gönderi için ortak)
function capBoxHtml(scope, { caption, tags }) {
  return `<fieldset class="reel-scene cap-box"><legend>Paylaşım metni</legend>
    <div class="field"><label for="${scope}-cap">Açıklama</label><textarea id="${scope}-cap" data-cap="${scope}" rows="6" maxlength="2000">${esc(caption || '')}</textarea></div>
    <div class="field"><label for="${scope}-tags">Hashtagler</label><input id="${scope}-tags" data-tags="${scope}" maxlength="600" value="${esc(tags || '')}"></div>
    <div id="${scope}-capcheck"></div>
    <div class="quick">
      ${s.ai ? `<button type="button" class="btn btn-ghost" data-act="cap-ai" data-scope="${scope}"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile açıklama yaz</button>` : ''}
      <button type="button" class="btn btn-ghost" data-act="cap-tags" data-scope="${scope}"><i class="ti ti-hash" aria-hidden="true"></i> Etiket öner</button>
      <button type="button" class="btn btn-ghost" data-act="cap-copy" data-scope="${scope}"><i class="ti ti-copy" aria-hidden="true"></i> Açıklama + etiketleri kopyala</button>
    </div>
  </fieldset>`;
}
function capState(scope) { return scope === 'reels' ? s.reel : s.gon; }
function capCheck(scope) {
  const st = capState(scope), box = el.querySelector(`#${scope}-capcheck`);
  if (!box) return;
  const f = checkMessage(`${st.caption || ''}\n${st.tags || ''}`);
  box.innerHTML = f.length ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}" — ${esc(x.tip)}</p>`).join('')}</div>` : '';
}
const fullCaption = st => [String(st.caption || '').trim(), String(st.tags || '').trim()].filter(Boolean).join('\n\n');
async function capAi(scope, btn) {
  const st = capState(scope);
  const post = s.posts.find(p => p.id === st.postId);
  const topic = st.topic || post?.topic || '';
  const pillar = PILLARS.find(x => x.id === (post?.pillar || st.pillar || 'yasam'));
  const body = scope === 'reels' ? storyboardText(st.sb).replace(/\n+/g, ' / ') : '';
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  try {
    const text = await aiChat({ maxTokens: 600, messages: [{ role: 'user', content:
      `Instagram ${scope === 'reels' ? 'Reels' : 'gönderi'} açıklaması yaz.
Konu: ${topic}
İçerik sütunu: ${pillar?.label} (${pillar?.hint})
${body ? 'Videodaki yazılar: ' + body : ''}
Marka sesi: samimi ama profesyonel, gerçekçi, abartısız; sağlık ve kişisel gelişim alanında bir girişimci.
${ETHICS} Satış çağrısı yapma.
${s.brand?.kw ? `Sonunda yorumlara "${s.brand.kw}" yazmaya davet et.` : 'Sonunda bir etkileşim sorusu olsun.'}
Kurallar: 50-110 kelime, en fazla 2 emoji, HASHTAG YAZMA. Sadece açıklama metnini yaz.` }] });
    st.caption = text.replace(/(^|\s)#\S+/g, '').trim().slice(0, 2000);
    const ta = el.querySelector(`#${scope}-cap`); if (ta) ta.value = st.caption;
    capCheck(scope); toast('Açıklama hazır; kendi sesine göre düzenle.');
  } catch (e) { toast('AI: ' + e.message); }
  btn.disabled = false; btn.innerHTML = old;
}
function capTags(scope) {
  const st = capState(scope);
  const post = s.posts.find(p => p.id === st.postId);
  st.tags = buildHashtags(post?.pillar || st.pillar || 'yasam', s.brand?.hashtags || '');
  const inp = el.querySelector(`#${scope}-tags`); if (inp) inp.value = st.tags;
  capCheck(scope);
}

function viewCalendar() {
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const key = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const upcoming = s.posts.filter(p => p.planned_for >= todayISO());
  const mix = Object.fromEntries(PILLARS.map(p => [p.id, 0]));
  upcoming.forEach(p => { if (p.pillar in mix) mix[p.pillar]++; });
  const total = upcoming.length || 1;
  const overdue = s.posts.filter(p => p.planned_for < todayISO() && p.status !== 'paylasildi');
  return `
    ${factoryCard()}
    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-chart-pie" aria-hidden="true"></i> İçerik dengesi (planlananlar)</h2>
      <div class="mix">${PILLARS.map(p => `<div class="mix-row"><span>${esc(p.label)}</span>
        <div class="meter"><span style="width:${Math.round((mix[p.id] / total) * 100)}%"></span></div>
        <span class="small muted">${mix[p.id]} · hedef %${p.share}</span></div>`).join('')}</div>
      <p class="small muted">Her gönderiyi satış çağrısına çevirme. Ekip ve iş içerikleri toplamın %10'u civarında kalsın.</p>
    </section>
    ${overdue.length ? `<section class="card" style="margin-top:16px"><h2><i class="ti ti-alert-circle" aria-hidden="true"></i> Bekleyenler</h2>
      ${overdue.map(postRow).join('')}</section>` : ''}
    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-calendar" aria-hidden="true"></i> Önümüzdeki 30 gün</h2>
      <div class="cal-days">${days.map(d => {
        const list = s.posts.filter(p => p.planned_for === key(d));
        return `<div class="cal-day ${list.length ? '' : 'empty'}">
          <div class="cal-date"><strong>${d.getDate()}</strong><span>${esc(d.toLocaleDateString('tr-TR', { weekday: 'short' }))}</span></div>
          <div class="cal-items">${list.map(postRow).join('') || `<button class="link-btn" data-act="new-post" data-date="${key(d)}">+ içerik ekle</button>`}</div></div>`;
      }).join('')}</div>
    </section>`;
}

function postRow(p) {
  const canMake = PLAN_FORMATS.includes(p.format) && p.status !== 'paylasildi';
  return `<div class="post-row">
    <button class="post-main" data-act="edit-post" data-id="${p.id}">
      <strong>${esc(p.topic)}</strong>
      <span class="small muted">${esc(hhmm(p.post_time))} · ${esc(FORMATS[p.format])} · ${esc(pillarLabel(p.pillar))}${p.tool && p.tool !== 'uygulama' ? ' · ' + esc(TOOLS[p.tool]?.label || '') : ''}${p.media ? ' · <i class="ti ti-paperclip" aria-label="Dosya var"></i>' : ''}</span></button>
    ${canMake ? `<button class="btn btn-gold sm" data-act="produce" data-id="${p.id}"><i class="ti ti-player-play" aria-hidden="true"></i> Oluştur</button>` : ''}
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
      <div class="form-2">
        <div class="field"><label for="c-time">Paylaşım saati</label><input id="c-time" name="post_time" type="time" value="${esc(hhmm(v.post_time || s.brand?.post_time))}"></div>
        <div class="field"><label for="c-tool">Üretim aracı</label><select id="c-tool" name="tool">${Object.entries(TOOLS).map(([k, t]) => `<option value="${k}" ${k === (v.tool || 'uygulama') ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="c-cap">Caption</label><textarea id="c-cap" name="caption" rows="5" maxlength="2200">${esc(v.caption)}</textarea>
        <span class="small muted" id="c-count">${(v.caption || '').length}/2200</span></div>
      <div class="field"><label for="c-tags">Hashtagler</label><input id="c-tags" name="hashtags" maxlength="600" value="${esc(v.hashtags || '')}"></div>
      <div id="c-check"></div>
      <div class="field"><label for="c-st">Durum</label><select id="c-st" name="status">${Object.entries(POST_STATUS).map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="error" id="c-error" role="alert"></p>
    </div>
    <footer class="sheet-foot">
      ${p ? '<button type="button" class="btn btn-ghost" data-act="del-post" data-id="' + p.id + '">Sil</button>' : ''}
      ${p && p.ig_permalink ? `<a class="btn btn-ghost" href="${esc(p.ig_permalink)}" target="_blank" rel="noopener"><i class="ti ti-brand-instagram" aria-hidden="true"></i> Instagram'da gör</a>` : ''}
      ${p && p.carousel ? '<button type="button" class="btn btn-ghost" data-act="kar-open" data-id="' + p.id + '"><i class="ti ti-carousel-horizontal" aria-hidden="true"></i> Karusel stüdyosunda aç</button>' : ''}
      ${p && PLAN_FORMATS.includes(p.format) ? '<button type="button" class="btn btn-gold" data-act="produce" data-id="' + p.id + '"><i class="ti ti-player-play" aria-hidden="true"></i> Stüdyoda oluştur</button>' : ''}
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

function gformCard() {
  const g = s.gform || {};
  const dt = d => d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const script = s.gToken ? appsScript(s.gToken) : '';
  return `<section class="card" style="margin-top:16px">
    <h2><i class="ti ti-brand-google" aria-hidden="true"></i> Google Form bağlantısı</h2>
    <p class="muted small">Mevcut Google formunu kullanmaya devam et; her yeni yanıt otomatik olarak Kazanım'a "Google formu" etiketiyle düşer ve bugünün takibine eklenir. Aynı telefon varsa yeni kayıt açılmaz, mevcut adayın notuna eklenir. Gelir hedefi sorusu hiç aktarılmaz.</p>
    <p class="small">${g.linked ? `<span class="badge">Bağlı</span> Son yanıt: ${esc(dt(g.last_at))} · Toplam: ${g.total}` : '<span class="badge">Bağlı değil</span>'}</p>
    ${s.gToken ? `<ol class="small">
        <li>Google formunun <b>yanıt tablosunu</b> aç → <b>Uzantılar → Apps Script</b>.</li>
        <li>İçindeki her şeyi sil, aşağıdaki kodu yapıştır, <b>Kaydet</b>.</li>
        <li>Üstteki listeden <b>kur</b> fonksiyonunu seç → <b>Çalıştır</b> → Google izinlerini onayla.</li>
        <li>Formu kendin bir kez "deneme" adıyla doldur: deneme kayıtları atlanır, Apps Script "Yürütmeler" ekranında 200 görürsen tamamdır.</li></ol>
      <div class="field"><label for="gf-code">Apps Script kodu (anahtar yalnızca şimdi görünür)</label><textarea id="gf-code" readonly rows="8">${esc(script)}</textarea></div>
      <button class="btn btn-gold" data-copy="${esc(script)}"><i class="ti ti-copy" aria-hidden="true"></i> Kodu kopyala</button>`
    : `<button class="btn ${g.linked ? 'btn-ghost' : 'btn-gold'}" data-act="gform-token"><i class="ti ti-key" aria-hidden="true"></i> ${g.linked ? 'Yeni anahtar ve kod üret (eskisi çalışmaz olur)' : 'Bağlantı kodunu oluştur'}</button>`}
    <h3 style="margin-top:18px">Google formundan gelen son adaylar</h3>
    <ul class="entry-list">${(s.gLeads || []).map(p => `<li><span>${esc(p.full_name)}</span><span class="small muted">${esc(new Date(p.created_at).toLocaleDateString('tr-TR'))}</span></li>`).join('') || '<li class="muted small">Henüz gelen yok.</li>'}</ul>
  </section>`;
}

async function gformToken(b) {
  if (s.gform?.linked && !confirm('Yeni anahtar üretilince Apps Script\'teki eski kod çalışmaz; yenisini yapıştırman gerekir. Devam?')) return;
  b.disabled = true;
  const { data, error } = await supabase.rpc('gform_new_token');
  b.disabled = false;
  if (error) { toast(trError(error)); return; }
  s.gToken = data; s.gform = { ...(s.gform || {}), linked: true, total: s.gform?.total || 0 };
  draw();
}

function viewForm() {
  return viewAppForm() + gformCard();
}

function viewAppForm() {
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
  const km = t.closest('[data-kmode]');
  if (km) { s.kar.mode = km.dataset.kmode; draw(); return; }
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
    case 'gform-token': gformToken(b); break;
    case 'reel-prev': s.reel.prev = +b.dataset.i; paintPreview(); markPrev(); break;
    case 'reel-ai': reelAi(b); break;
    case 'reel-render': reelRender(b); break;
    case 'reel-share': reelShare(); break;
    case 'reel-cal': reelToCalendar(b); break;
    case 'reel-open': reelOpen(id); break;
    case 'reel-new': reelNew(); break;
    case 'reel-clear': reelClearClip(+b.dataset.i); break;
    case 'reel-mode': reelMode(b.dataset.mode); break;
    case 'reel-step': s.reel.step = b.dataset.step; draw(); el.querySelector('.reel-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    case 'reel-outro': reelOutro(b); break;
    case 'plan-make': planMake(b); break;
    case 'plan-ai': planAi(b); break;
    case 'produce': produce(id); break;
    case 'tool': setTool(b.dataset.scope, b.dataset.tool); break;
    case 'cap-ai': capAi(b.dataset.scope, b); break;
    case 'cap-tags': capTags(b.dataset.scope); break;
    case 'cap-copy': navigator.clipboard.writeText(fullCaption(capState(b.dataset.scope))).then(() => toast('Açıklama ve etiketler kopyalandı.'), () => toast('Kopyalanamadı.')); break;
    case 'g-step': s.gon.step = b.dataset.step; draw(); break;
    case 'g-save': gSave(b); break;
    case 'g-done': gDone(b); break;
    case 'g-logo': s.gon.logoOn = !s.gon.logoOn; draw(); break;
    case 'g-pos': s.gon.logoPos = b.dataset.pos; gPaint(); el.querySelectorAll('[data-pos]').forEach(x => x.setAttribute('aria-pressed', x.dataset.pos === s.gon.logoPos)); break;
    case 'g-new': initGon(); draw(); break;
    case 'reel-parse': reelParse(); break;
    case 'reel-ai-src': reelAiSrc(b); break;
    case 'reel-add': reelSceneOp('add'); break;
    case 'reel-del': reelSceneOp('del', +b.dataset.i); break;
    case 'kar-prev': s.kar.prev = +b.dataset.i; kMarkPrev(); kPaint(); break;
    case 'kar-ai': kAi(b); break;
    case 'kar-ai-struct': kAi(b, true); break;
    case 'kar-parse': kParse(); break;
    case 'kar-add': case 'kar-del': case 'kar-up': case 'kar-down': case 'kar-item-add': case 'kar-item-del':
      kSlideOp(b.dataset.act, +b.dataset.i, +b.dataset.j); break;
    case 'kar-render': kRender(b); break;
    case 'kar-share': kShare(); break;
    case 'kar-zip': kZip(b); break;
    case 'kar-cal': kToCalendar(b); break;
    case 'kar-copycap': navigator.clipboard.writeText(suggestCaptionK(s.kar.deck)).then(() => toast('Açıklama metni kopyalandı.'), () => toast('Kopyalanamadı.')); break;
    case 'kar-open': kOpen(id); break;
    case 'kar-ig': igDialog(); break;
    case 'ig-retry': s.kar.ig = null; { const bx = el.querySelector('#ig-box'); if (bx) bx.innerHTML = '<p class="small muted">Kontrol ediliyor…</p>'; } igStatus(); break;
    case 'ig-publish': igPublish(b); break;
    case 'kar-new': kNew(); break;
    case 'kar-logo-del': s.kar.logo = null; s.kar.logoData = ''; kSaveBrand(); kOutReset(); draw(); break;
    case 'kar-photo-del': s.kar.photo = null; s.kar.photoData = ''; kSaveBrand(); kOutReset(); draw(); break;
  }
}
function onInput(e) {
  if (e.target.id === 'c-cap') updateCheck();
  if (e.target.dataset.reel) onReelInput(e.target);
  if (e.target.dataset.gon === 'topic') s.gon.topic = e.target.value;
  if (e.target.dataset.cap) { capState(e.target.dataset.cap).caption = e.target.value; capCheck(e.target.dataset.cap); }
  if (e.target.dataset.tags) { capState(e.target.dataset.tags).tags = e.target.value; capCheck(e.target.dataset.tags); }
  if (e.target.id === 'ig-cap') igUpdate();
  if (e.target.dataset.k || e.target.dataset.kf || e.target.dataset.kb) onKarInput(e.target);
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
    if (form.dataset.form === 'brand') await saveBrandKit(form);
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
    pillar: f('pillar').value, caption: f('caption').value.trim() || null, status: f('status').value,
    post_time: f('post_time').value || DEFAULT_TIME, tool: f('tool').value, hashtags: f('hashtags').value.trim() || null };
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
function initReel(mode = 'ai') {
  const brand = loadBrand();
  const sb = mode === 'metin' ? blankStoryboard(brand) : defaultStoryboard(brand);
  s.reel = { sb, mode, other: null, note: '', topic: '', postId: null, media: new Array(MAX_SCENES).fill(null),
    names: new Array(MAX_SCENES).fill(''), prev: 0, out: null, busy: false, quality: 1080,
    step: 'senaryo', tool: 'uygulama', caption: '', tags: '', ext: null, outroOn: true };
}
// Takvimdeki kayıttan araç, açıklama, etiket ve dış dosyayı al
function reelLoadPost(p) {
  Object.assign(s.reel, { tool: p.tool || 'uygulama', caption: p.caption || '', tags: p.hashtags || '', ext: p.media || null });
  if (!s.reel.tags) s.reel.tags = buildHashtags(p.pillar || 'yasam', s.brand?.hashtags || '');
  if (s.brand?.handle || s.brand?.kw) s.reel.sb = normalizeStoryboard({ ...s.reel.sb, handle: s.reel.sb.handle || s.brand.handle, kw: s.brand.kw || s.reel.sb.kw });
}

function setTool(scope, tool) {
  if (!TOOLS[tool]) return;
  if (scope === 'reels') s.reel.tool = tool; else s.gon.tool = tool;
  draw();
}

async function mediaUpload(scope, file) {
  if (!file) return;
  const isVideo = /^video\//.test(file.type), isImg = /^image\//.test(file.type);
  if (scope === 'reels' && !isVideo) { toast('Reels için video dosyası seç (MP4 ya da MOV).'); return; }
  if (scope === 'gonderi' && !isImg) { toast('Gönderi için görsel seç (JPEG ya da PNG).'); return; }
  if (scope === 'gonderi') { gPick(file, true); return; }
  const r = s.reel;
  r.extFile = file;
  if (r.out) { URL.revokeObjectURL(r.out.url); r.out = null; }
  const st = el.querySelector('#r-status'); if (st) st.textContent = 'Yükleniyor…';
  try {
    r.ext = await uploadMedia(file, { name: file.name, folder: 'reels' });
    r.out = { blob: file, url: URL.createObjectURL(file), name: file.name, ext: (file.name.split('.').pop() || 'mp4').toLowerCase(), width: 0, height: 0, drops: 0, external: true };
    await reelSaveFields({ media: r.ext, tool: r.tool, status: 'hazir' });
    toast('Video yüklendi ve takvimde "Hazır" işaretlendi.');
  } catch (e) { toast(e.message); }
  draw();
}

// Dış videoya logo videosunu ekle (yeniden kayıt) → yeni dosya olarak yükle
async function reelOutro(btn) {
  const r = s.reel;
  if (!r.extFile) { toast('Önce bu cihazdan bitmiş videoyu yükle.'); return; }
  let outro;
  try { outro = await getOutro(); } catch (e) { toast(e.message); return; }
  if (!outro) { toast('Önce Marka kitinden logo videosunu yükle (İçerik takvimi sekmesi).'); return; }
  r.busy = true; btn.disabled = true;
  const status = el.querySelector('#r-status'), prog = el.querySelector('#r-prog');
  if (status) status.textContent = 'Logo ekleniyor… video süresi kadar sürer, ekranı açık tut.';
  try {
    const canvas = document.createElement('canvas');
    const res = await appendOutro({ file: r.extFile, outro, canvas, onProgress: p => { if (prog) prog.style.width = Math.round(p * 100) + '%'; } });
    const name = reelFileName(r.topic || 'reels', res.ext);
    r.ext = await uploadMedia(res.blob, { name, folder: 'reels', ext: res.ext });
    if (r.out) URL.revokeObjectURL(r.out.url);
    r.out = { ...res, name, url: URL.createObjectURL(res.blob), drops: 0, external: true, withOutro: true };
    await reelSaveFields({ media: r.ext, status: 'hazir' });
    toast('Logo videosu eklendi.');
  } catch (e) { toast(e.message); }
  r.busy = false; draw();
}

// Takvimdeki kaydı sessizce güncelle (yoksa oluştur)
async function reelSaveFields(fields) {
  const r = s.reel;
  if (!r.postId) {
    const topic = (r.topic.trim() || r.sb.scenes[0].top.replace(/\n/g, ' ') || 'Reels').slice(0, 200);
    const { data, error } = await supabase.from('content_posts').insert({ org_id: ctx.org.id, topic, format: 'reels', planned_for: todayISO(),
      platform: 'Instagram', pillar: 'yasam', status: 'taslak', post_time: hhmm(s.brand?.post_time), storyboard: r.sb, ...fields }).select().single();
    if (error) throw new Error(trError(error));
    s.posts = [...s.posts, data]; r.postId = data.id; r.topic = data.topic; return;
  }
  const { data, error } = await supabase.from('content_posts').update(fields).eq('id', r.postId).select().single();
  if (error) throw new Error(trError(error));
  s.posts = s.posts.map(x => (x.id === data.id ? data : x));
}

const SEC_OPTS = Array.from({ length: (SEC_MAX - SEC_MIN) * 2 + 1 }, (_, i) => SEC_MIN + i / 2);
const fmtSec = x => String(x).replace('.', ',');

function sourceHtml(r) {
  if (r.mode === 'ai') {
    return `<div class="field"><label for="r-topic">Konu</label>
        <input id="r-topic" data-reel="topic" maxlength="200" value="${esc(r.topic)}" placeholder="Ör. İşimin yanında akşamlarım"></div>
      ${s.ai ? `<button type="button" class="btn btn-ghost" data-act="reel-ai"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile senaryo yaz</button>`
        : '<p class="small muted">AI asistan bu hesapta kapalı; senaryoyu aşağıdaki kutulara kendin yazabilir ya da "Benim metnim" modunu kullanabilirsin.</p>'}`;
  }
  return `<div class="field"><label for="r-topic">Başlık (takvimde görünür)</label>
      <input id="r-topic" data-reel="topic" maxlength="200" value="${esc(r.topic)}" placeholder="Ör. Sabah rutinim"></div>
    <div class="field"><label for="r-src">Senaryo metnin</label>
      <textarea id="r-src" data-reel="src" rows="9" maxlength="4000" placeholder="Her sahneyi boş bir satırla ayır.&#10;Sahnenin ilk satırı büyük başlık, sonrakiler alt yazı olur.&#10;&#10;Mesaim bitiyor.&#10;Asıl işimin yanında girişimciliğe zaman ayırıyorum.&#10;&#10;Slogan: Küçük ama istikrarlı adımlar&#10;CTA: Merak ediyorsan yorumlara yaz:">${esc(r.sb.src)}</textarea></div>
    <details class="small muted"><summary>Metni nasıl yazmalıyım?</summary>
      <ul>
        <li>Sahneleri <b>boş satırla</b>, <b>---</b> ile ya da <b>Sahne 1:</b> başlıklarıyla ayır (en fazla ${MAX_SCENES} sahne).</li>
        <li>Sahnenin ilk kısa satırı büyük başlık, kalanı alt yazı olur. Uzun tek cümle doğrudan alt yazıya gider.</li>
        <li><b>Slogan:</b> ve <b>CTA:</b> ile başlayan satırlar kapanışa yerleşir.</li>
        <li>Kelimelerin değiştirilmez; her sahnenin süresi okuma hızına göre ayarlanır, istersen sonra değiştirirsin.</li>
      </ul></details>
    <div class="quick">
      <button type="button" class="btn btn-primary" data-act="reel-parse"><i class="ti ti-layout-rows" aria-hidden="true"></i> Sahnelere böl</button>
      ${s.ai ? '<button type="button" class="btn btn-ghost" data-act="reel-ai-src"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile böl (metne sadık)</button>' : ''}
    </div>
    ${r.note ? `<div class="check-box ${r.noteWarn ? 'warn' : 'ok'}" style="margin-top:10px"><p>${esc(r.note)}</p></div>` : ''}`;
}

const REEL_STEPS = [{ id: 'senaryo', label: 'Senaryo' }, { id: 'gorsel', label: 'Görseller' }, { id: 'video', label: 'Video ve paylaşım' }];
function stepperHtml(steps, cur, act) {
  const idx = steps.findIndex(x => x.id === cur);
  return `<ol class="stepper" role="tablist">${steps.map((x, i) => `<li><button role="tab" data-act="${act}" data-step="${x.id}" aria-selected="${x.id === cur}" class="${i < idx ? 'done' : ''}">
    <span class="st-n">${i < idx ? '<i class="ti ti-check" aria-hidden="true"></i>' : i + 1}</span>${esc(x.label)}</button></li>`).join('')}</ol>`;
}
const nextBtn = (act, step, label) => `<button type="button" class="btn btn-primary" data-act="${act}" data-step="${step}">${esc(label)} <i class="ti ti-arrow-right" aria-hidden="true"></i></button>`;

function reelScenarioHtml(r, sb, N, tpl) {
  return `<div class="seg" role="tablist" aria-label="Senaryo kaynağı">
      <button role="tab" data-act="reel-mode" data-mode="ai" aria-selected="${r.mode === 'ai'}"><i class="ti ti-sparkles" aria-hidden="true"></i> AI asistan</button>
      <button role="tab" data-act="reel-mode" data-mode="metin" aria-selected="${r.mode === 'metin'}"><i class="ti ti-file-text" aria-hidden="true"></i> Benim metnim</button>
    </div>
    <p class="small muted">${r.mode === 'ai' ? `Şablon: <strong>${esc(tpl.label)}</strong>. ${esc(tpl.hint)}` : 'Kendi senaryonu yapıştır; uygulama sahnelere böler, kelimelerine dokunmaz.'} Kutularda 1. satır beyaz, sonrakiler altın yazılır.</p>
    ${sourceHtml(r)}
    ${sb.scenes.map((sc, i) => `<fieldset class="reel-scene">
      <legend>Sahne ${i + 1}</legend>
      <div class="reel-scene-tools">
        <label class="small" for="r-sec-${i}">Süre</label>
        <select id="r-sec-${i}" data-reel="sec" data-i="${i}">${SEC_OPTS.map(x => `<option value="${x}" ${x === sc.sec ? 'selected' : ''}>${fmtSec(x)} sn</option>`).join('')}</select>
        ${N > MIN_SCENES ? `<button type="button" class="icon-btn" data-act="reel-del" data-i="${i}" aria-label="Sahne ${i + 1}'i sil"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}
      </div>
      <div class="field"><label for="r-top-${i}">Başlık</label><textarea id="r-top-${i}" data-reel="top" data-i="${i}" rows="2" maxlength="60">${esc(sc.top)}</textarea></div>
      <div class="field"><label for="r-bot-${i}">Alt yazı</label><textarea id="r-bot-${i}" data-reel="bot" data-i="${i}" rows="${sc.bot.length > 70 ? 3 : 2}" maxlength="140">${esc(sc.bot)}</textarea></div>
    </fieldset>`).join('')}
    ${N < MAX_SCENES ? `<button type="button" class="btn btn-ghost" data-act="reel-add"><i class="ti ti-plus" aria-hidden="true"></i> Sahne ekle</button>` : ''}
    <fieldset class="reel-scene"><legend>Kapanış</legend>
      <div class="field"><label for="r-slogan">Slogan${r.mode === 'metin' ? ' (boş bırakılırsa gösterilmez)' : ''}</label><textarea id="r-slogan" data-reel="slogan" rows="2" maxlength="60">${esc(sb.slogan)}</textarea></div>
      <div class="field"><label for="r-cta">Çağrı cümlesi</label><textarea id="r-cta" data-reel="cta" rows="2" maxlength="90">${esc(sb.cta)}</textarea></div>
      <div class="form-2">
        <div class="field"><label for="r-handle">Hesap adı</label><input id="r-handle" data-reel="handle" maxlength="31" value="${esc(sb.handle)}" placeholder="@kullaniciadi" autocapitalize="off"></div>
        <div class="field"><label for="r-kw">Yorum anahtar kelimesi</label><input id="r-kw" data-reel="kw" maxlength="16" value="${esc(sb.kw)}"></div>
      </div>
    </fieldset>
    <div id="r-check"></div>
    <div class="quick step-nav">${nextBtn('reel-step', 'gorsel', 'Görsellere geç')}</div>`;
}

function reelVisualHtml(r, sb) {
  return `<p class="small muted">Her sahnenin arka planını seç. Seçmezsen örnek renkli arka plan kullanılır.
      Dışarıda (Canva, Higgsfield, Kling…) hazır video ürettiysen bu adımı atla, "Video ve paylaşım"da aracı seçip bitmiş dosyayı yükle.</p>
    ${sb.scenes.map((sc, i) => `<fieldset class="reel-scene">
      <legend>Sahne ${i + 1}: ${esc((sc.top || sc.bot).replace(/\n/g, ' ').slice(0, 40) || '—')}</legend>
      <div class="reel-clip">
        <label class="btn btn-ghost" for="r-file-${i}"><i class="ti ti-video-plus" aria-hidden="true"></i> Telefondan klip ya da foto</label>
        <input type="file" id="r-file-${i}" data-clip="${i}" accept="video/*,image/*" class="sr-only">
        <span class="small muted reel-clip-name" id="r-name-${i}">${esc(r.names[i] || 'Klip yok · örnek arka plan')}</span>
        ${r.media[i] ? `<button type="button" class="icon-btn" data-act="reel-clear" data-i="${i}" aria-label="Sahne ${i + 1} klibini kaldır"><i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
      </div>
    </fieldset>`).join('')}
    <div class="check-box"><p><strong>Yakında (Faz 2):</strong> Her sahne için stok video arama (Pexels) ve AI görsel üretimi bu ekrana gelecek.</p></div>
    <div class="quick step-nav">${nextBtn('reel-step', 'video', 'Videoya geç')}</div>`;
}

function reelVideoHtml(r, sb, sup) {
  const inApp = r.tool === 'uygulama';
  const brief = toolBrief({ topic: r.topic || sb.scenes[0].top.replace(/\n/g, ' '), format: 'reels' }, { tool: r.tool, storyboard: sb, brand: s.brand || {} });
  return `<p class="small muted">Bu Reels hangi araçla üretilsin?</p>
    ${toolPicker('reels', r.tool)}
    ${inApp ? `<div class="check-box ${s.brand?.logo_video_path ? 'ok' : 'warn'}"><p>
        <label class="inline-check"><input type="checkbox" id="r-outro" ${r.outroOn && s.brand?.logo_video_path ? 'checked' : ''} ${s.brand?.logo_video_path ? '' : 'disabled'} data-reel="outro"> Sona logo videosunu ekle</label>
        ${s.brand?.logo_video_path ? '' : ' · Önce <button type="button" class="link-btn" data-tab="takvim">Marka kiti</button>nden logo videosunu yükle.'}</p></div>
      <p class="small muted">Sağdaki önizlemeden "Videoyu üret"e dokun. Video telefonunda üretilir.</p>`
    : `${externalHtml('reels', { tool: r.tool, brief, media: r.ext, accept: 'video/mp4,video/quicktime,video/webm' })}
      ${r.extFile ? `<button type="button" class="btn btn-gold" data-act="reel-outro" ${s.brand?.logo_video_path && !r.busy ? '' : 'disabled'}><i class="ti ti-movie" aria-hidden="true"></i> ${r.out?.withOutro ? 'Logo eklendi · tekrar ekle' : 'Sona logo videosunu ekle'}</button>
        ${s.brand?.logo_video_path ? '' : '<p class="small muted">Logo videosu için önce Marka kitine yükle.</p>'}`
      : (r.ext ? '<p class="small muted">Dosya takvimde kayıtlı. Logo eklemek için videoyu bu cihazdan bir kez daha seç.</p>' : '')}`}
    ${capBoxHtml('reels', { caption: r.caption, tags: r.tags })}`;
}

function viewReels() {
  const r = s.reel, sb = r.sb, sup = reelSupport(window);
  const saved = s.posts.filter(p => p.storyboard).slice(-6).reverse();
  const tpl = TEMPLATES[sb.template];
  const N = sb.scenes.length;
  const post = s.posts.find(p => p.id === r.postId);
  return `
    ${sup.ok ? '' : `<div class="check-box warn"><p><strong>Bu tarayıcı video üretemiyor.</strong> Telefonunuzda Chrome'un güncel sürümüyle açın.</p></div>`}
    ${sup.ok && !sup.mp4 ? `<div class="check-box warn"><p>Bu tarayıcı yalnızca WebM üretebiliyor; Instagram kabul etmeyebilir. Chrome'un güncel sürümünü deneyin.</p></div>` : ''}
    <div class="compose reel-compose">
      <section class="card reel-form">
        <h2><i class="ti ti-movie" aria-hidden="true"></i> ${post ? 'Reels: ' + esc(post.topic) : 'Yeni Reels'}</h2>
        ${post ? `<p class="small muted"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(new Date(post.planned_for + 'T12:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(hhmm(post.post_time))} · ${POST_STATUS[post.status]}</p>`
          : ''}
        ${stepperHtml(REEL_STEPS, r.step, 'reel-step')}
        ${r.step === 'senaryo' ? reelScenarioHtml(r, sb, N, tpl) : r.step === 'gorsel' ? reelVisualHtml(r, sb) : reelVideoHtml(r, sb, sup)}
      </section>
      <section class="card reel-side">
        <h2><i class="ti ti-device-mobile" aria-hidden="true"></i> Önizleme</h2>
        <div class="reel-stage"><canvas id="r-canvas" width="540" height="960" aria-label="Video önizlemesi"></canvas></div>
        <div class="chips reel-prev-chips" role="group" aria-label="Önizlenecek sahne">
          ${[...sb.scenes.map((_, i) => [i, `${i + 1}`]), ...(sb.slogan ? [[N, 'Slogan']] : []), [N + 1, 'Kapanış']].map(([i, l]) => `<button class="chip" data-act="reel-prev" data-i="${i}" aria-pressed="${r.prev === i}">${l}</button>`).join('')}
        </div>
        ${r.tool === 'uygulama' ? `<div class="field"><label for="r-quality">Kalite</label>
          <select id="r-quality" data-reel="quality"><option value="1080" ${r.quality === 1080 ? 'selected' : ''}>1080 × 1920 (önerilen)</option><option value="720" ${r.quality === 720 ? 'selected' : ''}>720 × 1280 (eski telefonlar)</option></select></div>` : ''}
        <div class="reel-bar" aria-hidden="true"><span id="r-prog"></span></div>
        <p class="small muted" id="r-status" role="status">${r.busy ? 'İşleniyor…' : `Video ${fmtSec(Math.round(reelTotal(sb) * 2) / 2)} sn sürer (${N} sahne)${r.outroOn && s.brand?.logo_video_path ? ' + logo' : ''}; üretim sırasında ekranı açık tutun.`}</p>
        ${r.tool === 'uygulama' ? `<button type="button" class="btn btn-gold reel-go" data-act="reel-render" ${sup.ok && !r.busy ? '' : 'disabled'}><i class="ti ti-player-record" aria-hidden="true"></i> Videoyu üret</button>` : ''}
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
    <p class="small muted" style="margin-top:12px">Uygulamada üretilen video telefonunda kalır; dış araçtan yüklediğin dosya Instagram'a gönderilebilmesi için hesabındaki klasörde saklanır. Müziği paylaşırken Instagram'ın müzik kütüphanesinden ekleyin.</p>`;
}

// ====================================================================
// Gönderi stüdyosu: ① Görsel (kendi fotoğrafın ya da dış araç) → ② Açıklama, etiket, paylaşım
const GON_STEPS = [{ id: 'gorsel', label: 'Görsel' }, { id: 'aciklama', label: 'Açıklama ve paylaşım' }];
const GW = 1080, GH = 1350;
function initGon() {
  s.gon = { postId: null, topic: '', pillar: 'yasam', tool: 'uygulama', step: 'gorsel', img: null, imgName: '', logoOn: true, logoPos: 'br',
    caption: '', tags: buildHashtags('yasam', s.brand?.hashtags || ''), media: null, dirty: false };
}
function gonOpen(p) {
  initGon();
  Object.assign(s.gon, { postId: p.id, topic: p.topic, pillar: p.pillar || 'yasam', tool: p.tool || 'uygulama', caption: p.caption || '',
    tags: p.hashtags || buildHashtags(p.pillar || 'yasam', s.brand?.hashtags || ''), media: p.media || null, step: p.media ? 'aciklama' : 'gorsel' });
  if (p.media?.url) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { s.gon.img = img; s.gon.dirty = false; if (s.tab === 'gonderi') gPaint(); };
    img.src = p.media.url;
  }
  s.tab = 'gonderi'; history.replaceState(null, '', '#/pazarlama?tab=gonderi'); draw();
}

function viewGonderi() {
  const g = s.gon;
  const post = s.posts.find(p => p.id === g.postId);
  const brief = toolBrief({ topic: g.topic || 'Gönderi', format: 'gonderi' }, { tool: g.tool, brand: s.brand || {} });
  const todo = s.posts.filter(p => p.format === 'gonderi' && p.status !== 'paylasildi' && p.planned_for >= todayISO()).slice(0, 6);
  return `<div class="compose reel-compose">
    <section class="card reel-form">
      <h2><i class="ti ti-photo" aria-hidden="true"></i> ${post ? 'Gönderi: ' + esc(post.topic) : 'Yeni gönderi'}</h2>
      ${post ? `<p class="small muted"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(new Date(post.planned_for + 'T12:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(hhmm(post.post_time))} · ${POST_STATUS[post.status]}</p>`
        : `<p class="small muted">Takvimdeki bir gönderiyi "Oluştur" ile açarsan konu ve tarih otomatik gelir.</p>
           <div class="field"><label for="g-topic">Konu</label><input id="g-topic" data-gon="topic" maxlength="200" value="${esc(g.topic)}"></div>`}
      ${stepperHtml(GON_STEPS, g.step, 'g-step')}
      ${g.step === 'gorsel' ? `
        <p class="small muted">Bu gönderi hangi araçla üretilsin?</p>
        ${toolPicker('gonderi', g.tool)}
        ${g.tool === 'uygulama' ? `<div class="quick">
            <label class="btn btn-primary" for="g-photo"><i class="ti ti-photo-plus" aria-hidden="true"></i> ${g.img ? 'Fotoğrafı değiştir' : 'Fotoğraf seç'}</label>
            <input type="file" id="g-photo" accept="image/*" class="sr-only">
            ${g.imgName ? `<span class="small muted">${esc(g.imgName)}</span>` : ''}</div>
            <div class="check-box"><p><strong>Yakında (Faz 2):</strong> AI ile görsel üretimi ve stok fotoğraf arama.</p></div>`
          : externalHtml('gonderi', { tool: g.tool, brief, media: g.media, accept: 'image/jpeg,image/png,image/webp' })}
        <fieldset class="reel-scene"><legend>Logo</legend>
          <label class="inline-check"><input type="checkbox" data-act="g-logo" ${g.logoOn ? 'checked' : ''}> Görselin üzerine logomu koy</label>
          ${g.logoOn ? `<div class="chips" role="group" aria-label="Logo konumu">${[['br', 'Sağ alt'], ['bl', 'Sol alt'], ['tr', 'Sağ üst'], ['tl', 'Sol üst']].map(([k, l]) =>
            `<button type="button" class="chip" data-act="g-pos" data-pos="${k}" aria-pressed="${g.logoPos === k}">${l}</button>`).join('')}</div>` : ''}
          ${s.brand?.logo_path || s.kar?.logo ? '' : '<p class="small muted">Logo için önce İçerik takvimi → Marka kitinden logonu yükle.</p>'}
        </fieldset>
        <div class="quick step-nav">${nextBtn('g-step', 'aciklama', 'Açıklamaya geç')}</div>`
      : `${capBoxHtml('gonderi', { caption: g.caption, tags: g.tags })}
        <div class="quick step-nav">
          <button type="button" class="btn btn-primary" data-act="g-save"><i class="ti ti-device-floppy" aria-hidden="true"></i> Kaydet (Hazır)</button>
          ${post ? `<button type="button" class="btn btn-ghost" data-act="g-done"><i class="ti ti-check" aria-hidden="true"></i> Paylaştım</button>` : ''}
        </div>`}
      <p class="error" id="g-error" role="alert"></p>
    </section>
    <section class="card reel-side">
      <h2><i class="ti ti-device-mobile" aria-hidden="true"></i> Önizleme (4:5)</h2>
      <div class="gon-stage"><canvas id="g-canvas" width="540" height="675" aria-label="Gönderi önizlemesi"></canvas></div>
      <div class="quick" style="margin-top:10px">
        <button type="button" class="btn btn-ghost" data-act="g-save"><i class="ti ti-download" aria-hidden="true"></i> Kaydet ve indir</button>
        <button type="button" class="btn btn-ghost" data-act="g-new"><i class="ti ti-file-plus" aria-hidden="true"></i> Yeni gönderi</button>
      </div>
      ${todo.length ? `<h3 style="margin-top:18px">Sıradaki gönderiler</h3>
        <ul class="entry-list">${todo.map(p => `<li><button class="link-btn" data-act="produce" data-id="${p.id}">${esc(p.topic)}</button>
          <span class="small muted">${esc(new Date(p.planned_for + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))} · ${POST_STATUS[p.status]}</span></li>`).join('')}</ul>` : ''}
    </section>
  </div>`;
}

// Görseli 1080×1350'ye kırp, logoyu yerleştir
async function gCompose(c, W, H) {
  const g = s.gon, k = W / GW;
  c.fillStyle = '#111c33'; c.fillRect(0, 0, W, H);
  if (g.img) {
    const iw = g.img.naturalWidth, ih = g.img.naturalHeight;
    const sc = Math.max(W / iw, H / ih), dw = iw * sc, dh = ih * sc;
    c.drawImage(g.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `600 ${40 * k}px "DM Sans", sans-serif`; c.textAlign = 'center';
    c.fillText('Fotoğraf seç ya da yükle', W / 2, H / 2);
  }
  if (g.logoOn) {
    const logo = await getLogo();
    if (logo) {
      const lw = 190 * k, lh = lw * (logo.naturalHeight / logo.naturalWidth), m = 44 * k;
      const x = g.logoPos.endsWith('r') ? W - lw - m : m, y = g.logoPos.startsWith('b') ? H - lh - m : m;
      c.globalAlpha = 0.95; c.drawImage(logo, x, y, lw, lh); c.globalAlpha = 1;
    }
  }
}
async function gPaint() {
  const cv = el.querySelector('#g-canvas');
  if (!cv) return;
  await gCompose(cv.getContext('2d'), cv.width, cv.height);
  capCheck('gonderi');
}
function gPick(file, external) {
  if (!file) return;
  if (file.size > 30 * 1048576) { toast('Görsel çok büyük (30 MB üstü).'); return; }
  const img = new Image();
  img.onload = () => { s.gon.img = img; s.gon.imgName = file.name; s.gon.dirty = true; if (external) s.gon.extName = file.name; draw(); };
  img.onerror = () => toast('Görsel açılamadı; JPEG ya da PNG dene.');
  img.src = URL.createObjectURL(file);
}

async function gSave(btn) {
  const g = s.gon, err = el.querySelector('#g-error');
  if (!g.img) { if (err) err.textContent = 'Önce bir görsel seç ya da yükle.'; s.gon.step = 'gorsel'; draw(); return; }
  const risky = checkMessage(fullCaption(g)).filter(x => x.level === 'yuksek');
  if (risky.length && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; if (err) err.textContent = 'Açıklamada yüksek riskli ifade var. Yine de kaydetmek için tekrar dokun.'; return; }
  btn.disabled = true;
  try {
    const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
    await gCompose(cv.getContext('2d'), GW, GH);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.92));
    const name = reelFileName(g.topic || 'gonderi', 'jpg').replace(/^reels-/, 'gonderi-');
    if (g.dirty || !g.media) g.media = await uploadMedia(blob, { name, folder: 'gonderi', ext: 'jpg' });
    g.dirty = false;
    const row = { tool: g.tool, media: g.media, status: 'hazir', hashtags: (g.tags || '').trim() || null,
      ...(g.caption.trim() ? { caption: g.caption.trim().slice(0, 2200) } : {}) };
    let data, error;
    if (g.postId) ({ data, error } = await supabase.from('content_posts').update(row).eq('id', g.postId).select().single());
    else ({ data, error } = await supabase.from('content_posts').insert({ ...row, org_id: ctx.org.id, topic: (g.topic || 'Gönderi').slice(0, 200), format: 'gonderi',
      planned_for: todayISO(), platform: 'Instagram', pillar: g.pillar, post_time: hhmm(s.brand?.post_time) }).select().single());
    if (error) throw new Error(trError(error));
    s.posts = g.postId ? s.posts.map(x => (x.id === data.id ? data : x)) : [...s.posts, data];
    g.postId = data.id;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Gönderi "Hazır" olarak kaydedildi ve görsel indirildi.');
    draw();
  } catch (e) { if (err) err.textContent = e.message; }
  btn.disabled = false;
}
async function gDone(btn) {
  const g = s.gon; if (!g.postId) return;
  btn.disabled = true;
  const { data, error } = await supabase.from('content_posts').update({ status: 'paylasildi', published_at: new Date().toISOString() }).eq('id', g.postId).select().single();
  btn.disabled = false;
  if (error) { toast(trError(error)); return; }
  s.posts = s.posts.map(x => (x.id === data.id ? data : x));
  toast('Paylaşıldı olarak işaretlendi.'); draw();
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

function afterReelDraw() { updateReelCheck(); paintPreview(); capCheck('reels'); }

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
    drawReelFrame(cv.getContext('2d'), cv.width, cv.height, previewTime(i, s.reel.sb), s.reel.media, s.reel.sb);
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
  if (k === 'outro') { r.outroOn = t.checked; return; }
  if (k === 'src') { r.sb = { ...r.sb, src: t.value.slice(0, 4000) }; return; }
  const N = r.sb.scenes.length;
  const raw = { ...r.sb, scenes: r.sb.scenes.map(x => ({ ...x })) };
  if (k === 'top' || k === 'bot' || k === 'sec') { raw.scenes[i][k] = k === 'sec' ? +t.value : t.value; r.prev = i; markPrev(); }
  else raw[k] = t.value;
  const hadSlogan = !!r.sb.slogan;
  if (k === 'slogan') { r.prev = N; markPrev(); }
  if (k === 'cta' || k === 'kw' || k === 'handle') { r.prev = N + 1; markPrev(); }
  r.sb = normalizeStoryboard(raw);
  if (k === 'sec') { const st = el.querySelector('#r-status'); if (st && !r.busy) st.textContent = `Video ${fmtSec(Math.round(reelTotal(r.sb) * 2) / 2)} sn sürer (${N} sahne); üretim sırasında ekranı açık tutun.`; }
  if (k === 'slogan' && hadSlogan !== !!r.sb.slogan) { draw(); el.querySelector('#r-slogan')?.focus(); return; }
  if (k === 'handle' || k === 'kw') saveBrand(r.sb);
  updateReelCheck(); paintPreview();
}

async function onChange(e) {
  const t = e.target;
  if (t.id === 'ig-ok' || t.id === 'ig-cap') { igUpdate(); return; }
  if (t.id === 'k-photo') { kPhoto(t.files && t.files[0]); return; }
  if (t.id === 'b-logo') { brandFile('logo', t.files && t.files[0]); return; }
  if (t.id === 'b-video') { brandFile('video', t.files && t.files[0]); return; }
  if (t.id === 'g-photo') { gPick(t.files && t.files[0], false); return; }
  if (t.dataset.media) { mediaUpload(t.dataset.media, t.files && t.files[0]); return; }
  if (t.id === 'k-logo') { kLogo(t.files && t.files[0]); return; }
  if (t.dataset.kb === 'handle') { t.value = normalizeBrand({ handle: t.value }).handle; return; }
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
    let outro = null;
    if (r.outroOn) { try { outro = await getOutro(); } catch { toast('Logo videosu yüklenemedi; videosuz devam ediliyor.'); } }
    const res = await renderReel({ canvas, sb: r.sb, media: r.media, size: r.quality, outro,
      onProgress: p => { const b = prog(); if (b) b.style.width = Math.round(p * 100) + '%'; } });
    const name = reelFileName(r.topic || r.sb.scenes[0].top, res.ext);
    r.out = { ...res, name, url: URL.createObjectURL(res.blob), withOutro: !!outro };
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
  try { await navigator.share({ files: [file], text: fullCaption(s.reel) || suggestCaption(s.reel.sb) }); }
  catch (e) { if (e.name !== 'AbortError') toast('Paylaşılamadı; önce telefona kaydedin.'); }
}

async function reelToCalendar(btn) {
  const r = s.reel, err = el.querySelector('#r-error');
  const risky = reelFindings(r.sb).filter(x => x.level === 'yuksek');
  if (risky.length && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; err.textContent = 'Metinde yüksek riskli ifade var. Yine de kaydetmek için tekrar dokunun.'; return; }
  err.textContent = ''; btn.disabled = true;
  const topic = (r.topic.trim() || r.sb.scenes[0].top.replace(/\n/g, ' ')).slice(0, 200);
  const row = { topic, format: 'reels', storyboard: r.sb, tool: r.tool, hashtags: (r.tags || '').trim() || null,
    ...(r.caption.trim() ? { caption: r.caption.trim().slice(0, 2200) } : {}), ...(r.ext ? { media: r.ext } : {}) };
  let q;
  if (r.postId) q = supabase.from('content_posts').update(row).eq('id', r.postId).select().single();
  else q = supabase.from('content_posts').insert({ caption: suggestCaption(r.sb).slice(0, 2200), ...row, org_id: ctx.org.id, planned_for: todayISO(), platform: 'Instagram',
    pillar: 'yasam', status: r.out ? 'hazir' : 'taslak', post_time: hhmm(s.brand?.post_time) }).select().single();
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
  s.reel.mode = s.reel.sb.mode; s.reel.other = null; s.reel.note = ''; s.reel.step = 'senaryo';
  reelLoadPost(p);
  s.tab = 'reels'; history.replaceState(null, '', '#/pazarlama?tab=reels'); draw();
}

function reelNew(silent = false) {
  if (s.reel.busy) return;
  releaseClips(s.reel.media);
  if (s.reel.out) URL.revokeObjectURL(s.reel.out.url);
  const q = s.reel.quality, mode = s.reel.mode;
  initReel(mode); s.reel.quality = q;
  s.reel.tags = buildHashtags('yasam', s.brand?.hashtags || '');
  if (s.brand?.handle || s.brand?.kw) s.reel.sb = normalizeStoryboard({ ...s.reel.sb, handle: s.brand.handle || s.reel.sb.handle, kw: s.brand.kw || s.reel.sb.kw });
  if (!silent) draw();
}

// Mod değişince öbür moddaki senaryo saklanır; geri dönünce kaldığı yerden devam
function reelMode(mode) {
  const r = s.reel;
  if (r.busy || mode === r.mode) return;
  const keep = r.sb;
  const brand = { kw: keep.kw, handle: keep.handle };
  r.sb = r.other && r.other.mode === mode ? r.other : (mode === 'metin' ? blankStoryboard(brand) : defaultStoryboard(brand));
  r.sb = normalizeStoryboard({ ...r.sb, kw: keep.kw, handle: keep.handle });
  r.other = keep; r.mode = mode; r.prev = 0; r.note = '';
  draw();
}

function reelApply(sb, note, warn = false) {
  const r = s.reel;
  r.sb = sb; r.prev = 0; r.note = note; r.noteWarn = warn;
  if (r.out) { URL.revokeObjectURL(r.out.url); r.out = null; }
  draw();
}

function reelParse() {
  const r = s.reel, src = (el.querySelector('#r-src')?.value || r.sb.src || '').trim();
  const err = el.querySelector('#r-error');
  if (src.length < 3) { err.textContent = 'Önce senaryo metnini yaz ya da yapıştır.'; el.querySelector('#r-src')?.focus(); return; }
  err.textContent = '';
  const p = parseScript(src);
  const sb = normalizeStoryboard({ ...r.sb, v: REEL_SCHEMA, mode: 'metin', src, scenes: p.scenes, slogan: p.slogan, cta: p.cta || r.sb.cta });
  if (!r.topic) r.topic = (p.scenes[0].top || p.scenes[0].bot).replace(/\n/g, ' ').slice(0, 80);
  reelApply(sb, `${sb.scenes.length} sahne hazır · video ${fmtSec(Math.round(reelTotal(sb) * 2) / 2)} sn.${p.warnings.length ? ' ' + p.warnings.join(' ') : ' Kutulardan düzeltebilir, süreleri değiştirebilirsin.'}`, p.warnings.length > 0);
}

async function reelAiSrc(btn) {
  const r = s.reel, src = (el.querySelector('#r-src')?.value || r.sb.src || '').trim();
  const err = el.querySelector('#r-error');
  if (src.length < 3) { err.textContent = 'Önce senaryo metnini yaz ya da yapıştır.'; return; }
  err.textContent = '';
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Bölünüyor…';
  try {
    const text = await aiChat({ maxTokens: 1400, messages: [{ role: 'user', content: aiScriptPrompt(src) }] });
    const sb = parseAiScript(extractJSON(text), { ...r.sb, src }, src);
    const f = fidelity(src, sb);
    if (!r.topic) r.topic = (sb.scenes[0].top || sb.scenes[0].bot).replace(/\n/g, ' ').slice(0, 80);
    reelApply(sb, f < 0.9
      ? `Dikkat: AI metnindeki kelimelerin yaklaşık %${Math.round((1 - f) * 100)}'ini değiştirmiş olabilir. Kutuları kontrol et ya da "Sahnelere böl"ü kullan.`
      : `${sb.scenes.length} sahne hazır · metnine sadık kalındı · video ${fmtSec(Math.round(reelTotal(sb) * 2) / 2)} sn.`, f < 0.9);
  } catch (e) {
    err.textContent = 'AI: ' + e.message;
    btn.disabled = false; btn.innerHTML = old;
  }
}

function reelSceneOp(op, i) {
  const r = s.reel, scenes = r.sb.scenes.map(x => ({ ...x }));
  if (op === 'add' && scenes.length < MAX_SCENES) {
    scenes.push({ top: '', bot: '', sec: SCENE_LEN });
    r.prev = scenes.length - 1;
  }
  if (op === 'del' && scenes.length > MIN_SCENES) {
    scenes.splice(i, 1);
    releaseClips([r.media[i]]);
    r.media.splice(i, 1); r.media.push(null);
    r.names.splice(i, 1); r.names.push('');
    r.prev = Math.min(r.prev, scenes.length - 1);
  }
  r.sb = normalizeStoryboard({ ...r.sb, v: REEL_SCHEMA, scenes });
  draw();
}

// ====================================================================
// Karusel Stüdyosu: içerik (AI / kendi metnim / elle) → sayfa düzenleme → telefonda PNG üretimi → paylaş/indir/takvime ekle
const kBrandKey = () => `nmd_karusel_brand_${ctx.user.id}`;
function kLoadBrand() {
  let b = {};
  try { b = JSON.parse(localStorage.getItem(kBrandKey()) || '{}'); } catch { /* yok */ }
  if (!b.handle) { try { b.handle = JSON.parse(localStorage.getItem(brandKey()) || '{}').handle || ''; } catch { /* yok */ } }
  if (b.name === undefined) b.name = ctx.profile?.full_name || '';
  return b;
}
function kSaveBrand() {
  const k = s.kar;
  try { localStorage.setItem(kBrandKey(), JSON.stringify({ ...k.deck.brand, photo: k.photoData || '', logo: k.logoData || '' })); }
  catch { toast('Fotoğraf cihazda saklanamadı (alan dolu); bu oturumda kullanılacak.'); }
}
function initKar() {
  const b = kLoadBrand();
  s.kar = { deck: sampleDeck(b), postId: null, count: 8, mode: 'konu', paste: '', open: 0, prev: 0,
    photoData: b.photo || '', photo: null, logoData: b.logo || '', logo: null, out: [], busy: false, sample: true };
  imageFromData(s.kar.photoData).then(img => { s.kar.photo = img; if (s.tab === 'karusel') kPaint(); });
  imageFromData(s.kar.logoData).then(img => { s.kar.logo = img; if (s.tab === 'karusel') kPaint(); });
}

function viewKarusel() {
  const k = s.kar, d = k.deck;
  const saved = s.posts.filter(p => p.carousel).slice(-6).reverse();
  return `
    <div class="compose reel-compose kar-compose">
      <section class="card reel-form">
        <h2><i class="ti ti-carousel-horizontal" aria-hidden="true"></i> ${k.postId ? 'Karusel (takvimden)' : 'Yeni karusel'}</h2>
        ${k.sample ? '<p class="small muted">Aşağıdaki örnek, beğendiğin karuselin yapısıyla hazırlandı. Konunu yaz ya da kendi metnini yapıştır.</p>' : ''}
        <div class="seg seg-sm" role="tablist" aria-label="İçerik kaynağı">
          <button role="tab" data-kmode="konu" aria-selected="${k.mode === 'konu'}"><i class="ti ti-sparkles" aria-hidden="true"></i> Uygulama yazsın</button>
          <button role="tab" data-kmode="metin" aria-selected="${k.mode === 'metin'}"><i class="ti ti-clipboard-text" aria-hidden="true"></i> Ben vereyim</button>
        </div>
        ${k.mode === 'konu' ? `
          <div class="form-2">
            <div class="field"><label for="k-topic">Konu</label><input id="k-topic" data-kf="topic" maxlength="200" value="${esc(d.topic)}" placeholder="Ör. Soru sorarak güven kurmak"></div>
            <div class="field"><label for="k-count">Sayfa sayısı</label><select id="k-count" data-kf="count">${[5, 6, 7, 8, 9, 10].map(n => `<option ${k.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          </div>
          ${s.ai ? `<button type="button" class="btn btn-primary" data-act="kar-ai"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile karusel yaz</button>`
            : '<p class="small muted">AI kurulu değil; "Ben vereyim" ile kendi metnini kullanabilirsin.</p>'}`
        : `
          <div class="field"><label for="k-paste">Metnin</label>
            <textarea id="k-paste" data-kf="paste" rows="9" placeholder="Sayfaları --- ile ayır.\n[kapak] 8 Sayfalık Rehber\n# Başlık (altın için *kelime*)\n== Altın şerit cümlesi\nParagraf metni...\n- Etiket: madde\n> Alt alıntı *vurgu*\n---\n# İkinci sayfa...">${esc(k.paste)}</textarea></div>
          <div class="quick">
            <button type="button" class="btn btn-primary" data-act="kar-parse"><i class="ti ti-layout-list" aria-hidden="true"></i> Sayfalara böl</button>
            ${s.ai ? '<button type="button" class="btn btn-ghost" data-act="kar-ai-struct"><i class="ti ti-sparkles" aria-hidden="true"></i> AI düzenlesin (kelimelerimi korusun)</button>' : ''}
          </div>
          <p class="small muted">Düz paragraf da yapıştırabilirsin; "AI düzenlesin" sayfalara böler, senin cümlelerini korur.</p>`}

        <details class="reel-brand"${d.brand.web || d.brand.handle ? '' : ' open'}><summary>Marka ve fotoğraf</summary>
          <div class="kar-photo">
            ${k.photoData ? `<img src="${k.photoData}" alt="Karusel fotoğrafı">` : '<span class="kar-ph"><i class="ti ti-user" aria-hidden="true"></i></span>'}
            <div><label class="btn btn-ghost" for="k-photo"><i class="ti ti-photo-plus" aria-hidden="true"></i> ${k.photoData ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}</label>
              <input type="file" id="k-photo" accept="image/*" class="sr-only">
              ${k.photoData ? '<button type="button" class="link-btn" data-act="kar-photo-del">Kaldır</button>' : ''}
              <p class="small muted">Sol üst köşede görünür (portre önerilir). Yalnızca bu cihazda saklanır.</p></div>
          </div>
          <div class="kar-photo">
            ${k.logoData ? `<img src="${k.logoData}" alt="Logo" class="kar-logo">` : '<span class="kar-ph kar-logo"><i class="ti ti-crown" aria-hidden="true"></i></span>'}
            <div><label class="btn btn-ghost" for="k-logo"><i class="ti ti-upload" aria-hidden="true"></i> ${k.logoData ? 'Logoyu değiştir' : 'Logo ekle'}</label>
              <input type="file" id="k-logo" accept="image/png,image/webp,image/svg+xml,image/*" class="sr-only">
              ${k.logoData ? '<button type="button" class="link-btn" data-act="kar-logo-del">Kaldır</button>' : ''}
              <p class="small muted">Her sayfanın üstünde ve altında görünür. Arka planı saydam PNG en iyisi.</p></div>
          </div>
          <div class="field"><label for="k-name">Logodaki ad</label><input id="k-name" data-kb="name" maxlength="40" value="${esc(d.brand.name)}" placeholder="Ör. Hakan Gedikli"></div>
          <div class="form-2">
            <div class="field"><label for="k-web">Web sitesi</label><input id="k-web" data-kb="web" maxlength="60" value="${esc(d.brand.web)}" placeholder="www.siteniz.com" autocapitalize="off"></div>
            <div class="field"><label for="k-handle">Instagram</label><input id="k-handle" data-kb="handle" maxlength="31" value="${esc(d.brand.handle)}" placeholder="@kullaniciadi" autocapitalize="off"></div>
          </div>
          <div class="field"><label for="k-wa">WhatsApp kanal bağlantısı</label><input id="k-wa" data-kb="wa" maxlength="120" value="${esc(d.brand.wa)}" placeholder="https://whatsapp.com/channel/..." autocapitalize="off"></div>
          <div class="field"><label for="k-follow">"Bizi takip edin" açıklaması</label><input id="k-follow" data-kb="follow" maxlength="140" value="${esc(d.brand.follow)}"></div>
        </details>

        <h3 style="margin-top:16px">Sayfalar <span class="badge">${d.slides.length}</span></h3>
        ${d.slides.map((sl, i) => kSlideEditor(sl, i, d.slides.length)).join('')}
        ${d.slides.length < MAX_SLIDES ? '<button type="button" class="btn btn-ghost" data-act="kar-add"><i class="ti ti-plus" aria-hidden="true"></i> Sayfa ekle</button>' : ''}
        <div id="k-check"></div>
      </section>

      <section class="card reel-side">
        <h2><i class="ti ti-device-mobile" aria-hidden="true"></i> Önizleme</h2>
        <div class="reel-stage"><canvas id="k-canvas" width="540" height="675" aria-label="Karusel sayfa önizlemesi"></canvas></div>
        <div class="chips reel-prev-chips" role="group" aria-label="Önizlenecek sayfa">
          ${d.slides.map((_, i) => `<button class="chip" data-act="kar-prev" data-i="${i}" aria-pressed="${k.prev === i}">${i + 1}</button>`).join('')}
        </div>
        <div class="reel-bar" aria-hidden="true"><span id="k-prog"></span></div>
        <button type="button" class="btn btn-gold reel-go" data-act="kar-render" ${k.busy || !d.slides.length ? 'disabled' : ''}><i class="ti ti-photo-down" aria-hidden="true"></i> ${k.busy ? 'Üretiliyor…' : `${d.slides.length} görseli üret`}</button>
        <div id="k-out">${kOutHtml()}</div>
        <div class="quick" style="margin-top:12px">
          <button type="button" class="btn btn-ghost" data-act="kar-cal"><i class="ti ti-calendar-plus" aria-hidden="true"></i> ${k.postId ? 'Takvimde güncelle' : 'Takvime kaydet'}</button>
          <button type="button" class="btn btn-ghost" data-act="kar-copycap"><i class="ti ti-copy" aria-hidden="true"></i> Açıklama metnini kopyala</button>
          <button type="button" class="btn btn-ghost" data-act="kar-new"><i class="ti ti-file-plus" aria-hidden="true"></i> Yeni karusel</button>
        </div>
        <p class="error" id="k-error" role="alert"></p>
        ${saved.length ? `<h3 style="margin-top:18px">Kayıtlı karuseller</h3>
          <ul class="entry-list">${saved.map(p => `<li><button class="link-btn" data-act="kar-open" data-id="${p.id}">${esc(p.topic)}</button>
            <span class="small muted">${esc(new Date(p.planned_for).toLocaleDateString('tr-TR'))} · ${POST_STATUS[p.status]}</span></li>`).join('')}</ul>` : ''}
      </section>
    </div>
    <p class="small muted" style="margin-top:12px">Görseller telefonunda üretilir (1080 × 1350, Instagram dikey). "Instagram'da paylaş" tüm sayfaları tek seferde gönderir; Instagram'da gönderi olarak seçip karusel yapabilirsin.</p>`;
}

function kSlideEditor(sl, i, n) {
  const open = s.kar.open === i;
  const items = sl.layout === 'uclu' || sl.layout === 'liste' || sl.layout === 'adim';
  const maxItems = sl.layout === 'liste' ? 4 : 3;
  return `<details class="reel-scene kar-slide" data-slide="${i}" ${open ? 'open' : ''}>
    <summary><span class="q-no">${i + 1}</span> <strong>${esc(LAYOUTS[sl.layout].label)}</strong> <span class="muted small">${esc((sl.title || '').replace(/\*/g, '').slice(0, 44))}</span></summary>
    <div class="form-2">
      <div class="field"><label>Düzen</label><select data-k="layout" data-i="${i}">${Object.entries(LAYOUTS).map(([key, v]) => `<option value="${key}" ${sl.layout === key ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Simge</label><select data-k="emblem" data-i="${i}">${Object.entries(EMBLEMS).map(([key, v]) => `<option value="${key}" ${sl.emblem === key ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Rozet</label><input data-k="badge" data-i="${i}" maxlength="34" value="${esc(sl.badge)}" placeholder="Ör. 2. Öne Çıkan Strateji"></div>
    <div class="field"><label>Başlık <span class="muted small">(*kelime* altın olur)</span></label><textarea data-k="title" data-i="${i}" rows="2" maxlength="80">${esc(sl.title)}</textarea></div>
    ${['kapak', 'liste', 'fikir'].includes(sl.layout) ? `<div class="field"><label>Altın şerit (isteğe bağlı)</label><input data-k="ribbon" data-i="${i}" maxlength="120" value="${esc(sl.ribbon)}"></div>` : ''}
    <div class="field"><label>Paragraf</label><textarea data-k="body" data-i="${i}" rows="3" maxlength="460">${esc(sl.body)}</textarea></div>
    ${items ? `<div class="kar-items">${sl.items.map((it, j) => `<div class="kar-item">
        <input data-k="label" data-i="${i}" data-j="${j}" maxlength="26" value="${esc(it.label)}" placeholder="Etiket" aria-label="Madde ${j + 1} etiketi">
        <input data-k="text" data-i="${i}" data-j="${j}" maxlength="120" value="${esc(it.text)}" placeholder="Metin" aria-label="Madde ${j + 1} metni">
        <button type="button" class="icon-btn" data-act="kar-item-del" data-i="${i}" data-j="${j}" aria-label="Maddeyi sil"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('')}
      ${sl.items.length < maxItems ? `<button type="button" class="link-btn" data-act="kar-item-add" data-i="${i}">+ Madde ekle</button>` : ''}</div>` : ''}
    <div class="field"><label>Alt alıntı <span class="muted small">(*vurgu*)</span></label><input data-k="quote" data-i="${i}" maxlength="96" value="${esc(sl.quote)}"></div>
    <div class="quick">
      <button type="button" class="icon-btn" data-act="kar-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı taşı"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" data-act="kar-down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Aşağı taşı"><i class="ti ti-arrow-down" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" data-act="kar-del" data-i="${i}" ${n <= MIN_SLIDES ? 'disabled' : ''} aria-label="Sayfayı sil"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </div>
  </details>`;
}

function kOutHtml() {
  const out = s.kar.out;
  if (!out.length) return '';
  const files = out.map(o => new File([o.blob], o.name, { type: 'image/png' }));
  const canShare = !!(navigator.canShare && navigator.canShare({ files }));
  return `<div class="kar-result">
    <div class="kar-thumbs">${out.map((o, i) => `<a href="${o.url}" download="${esc(o.name)}" title="${i + 1}. sayfayı indir"><img src="${o.url}" alt="${i + 1}. sayfa"></a>`).join('')}</div>
    <div class="quick">
      ${canShare ? '<button type="button" class="btn btn-gold" data-act="kar-share"><i class="ti ti-brand-instagram" aria-hidden="true"></i> Instagram\'da paylaş</button>' : ''}
      <button type="button" class="btn btn-ghost" data-act="kar-zip"><i class="ti ti-file-zip" aria-hidden="true"></i> Hepsini indir (ZIP)</button>
    </div>
    <p class="small muted">Tek sayfayı indirmek için küçük resme dokun.</p>
    ${igButtonHtml()}</div>`;
}

function kAfterDraw() { kCheck(); kPaint(); }
let kQueued = false;
async function kPaint() {
  if (kQueued) return; kQueued = true;
  await loadDeckFonts();
  requestAnimationFrame(() => {
    kQueued = false;
    const cv = el.querySelector('#k-canvas'); const k = s.kar;
    if (!cv || !k.deck.slides.length) return;
    const c = cv.getContext('2d');
    c.save(); c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    drawSlide(c, k.deck, Math.min(k.prev, k.deck.slides.length - 1), k.photo, k.logo);
    c.restore();
  });
}
function kMarkPrev() { el.querySelectorAll('[data-act="kar-prev"]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === s.kar.prev)); }
function kCheck() {
  const box = el.querySelector('#k-check'); if (!box) return;
  const f = deckFindings(s.kar.deck);
  box.innerHTML = f.length ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}" — ${esc(x.tip)}</p>`).join('')}</div>`
    : '<div class="check-box ok"><i class="ti ti-shield-check" aria-hidden="true"></i> Marka ve uyum kontrolü: sorun görünmüyor</div>';
}
function kOutReset() { for (const o of s.kar.out) URL.revokeObjectURL(o.url); s.kar.out = []; const b = el.querySelector('#k-out'); if (b) b.innerHTML = ''; }

// Yazarken yeniden çizme: durumu, kontrolü ve önizlemeyi güncelle
function onKarInput(t) {
  const k = s.kar;
  if (t.dataset.kf === 'topic') { k.deck.topic = t.value.slice(0, 200); return; }
  if (t.dataset.kf === 'paste') { k.paste = t.value; return; }
  if (t.dataset.kf === 'count') { k.count = +t.value; return; }
  if (t.dataset.kb) {
    k.deck.brand = normalizeBrand({ ...k.deck.brand, [t.dataset.kb]: t.value });
    kSaveBrand(); kOutReset();
    const last = k.deck.slides.length - 1; if (k.deck.slides[last]?.layout === 'kapanis') { k.prev = last; kMarkPrev(); }
    kPaint(); return;
  }
  const key = t.dataset.k; if (!key) return;
  const i = +t.dataset.i, sl = { ...k.deck.slides[i], items: k.deck.slides[i].items.map(x => ({ ...x })) };
  if (key === 'label' || key === 'text') sl.items[+t.dataset.j][key] = t.value;
  else sl[key] = t.value;
  k.deck.slides[i] = normalizeSlide(sl, i, k.deck.slides.length);
  k.sample = false; k.prev = i; k.open = i; kOutReset(); kMarkPrev(); kCheck(); kPaint();
  if (key === 'layout') draw();
}

function kSet(deck, msg) {
  const k = s.kar;
  k.deck = normalizeDeck({ ...deck, brand: k.deck.brand }); k.prev = 0; k.open = 0; k.sample = false; kOutReset(); draw();
  if (msg) toast(msg);
}

async function kAi(btn, structure = false) {
  const k = s.kar, err = el.querySelector('#k-error');
  const src = structure ? k.paste.trim() : k.deck.topic.trim();
  if (src.length < 4) { err.textContent = structure ? 'Önce metnini yapıştır.' : 'Önce konuyu yaz.'; return; }
  err.textContent = '';
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  try {
    const prompt = structure ? aiStructurePrompt(src) : aiDeckPrompt(src, k.count);
    let j;
    try { j = extractJSON(await aiChat({ maxTokens: 3000, messages: [{ role: 'user', content: prompt }] })); }
    catch (e) {
      if (!/yarım|anlaşılamadı/.test(e.message)) throw e;
      j = extractJSON(await aiChat({ maxTokens: 3000, messages: [{ role: 'user', content: prompt + '\nÖNEMLİ: Daha kısa yaz; paragraflar en fazla 200 karakter. Yalnızca geçerli JSON.' }] }));
    }
    const deck = parseAiDeck(j, { ...k.deck, topic: structure ? (k.deck.topic || '') : src });
    if (!deck.topic) deck.topic = String(deck.slides[0]?.title || '').replace(/\*/g, '').slice(0, 200);
    kSet(deck, 'Karusel hazır; sayfaları kendi diline göre düzenle.');
  } catch (e) {
    const box = el.querySelector('#k-error'); if (box) box.textContent = 'AI: ' + e.message;
    btn.disabled = false; btn.innerHTML = old;
  }
}

function kParse() {
  const k = s.kar, err = el.querySelector('#k-error');
  const deck = parseDeckText(k.paste, k.deck.brand);
  if (deck.slides.length < MIN_SLIDES) { err.textContent = `En az ${MIN_SLIDES} sayfa gerekli. Sayfaları --- ile ayır ya da "AI düzenlesin"i kullan.`; return; }
  if (!deck.topic) deck.topic = String(deck.slides[0]?.title || '').replace(/\*/g, '').slice(0, 200);
  kSet(deck, `${deck.slides.length} sayfa oluşturuldu.`);
}

function kSlideOp(act, i, j) {
  const k = s.kar, sl = k.deck.slides;
  if (act === 'kar-add') { sl.push(normalizeSlide({ layout: 'fikir', badge: `${sl.length}. Bölüm`, title: 'Yeni sayfa', body: '' }, sl.length, sl.length + 2)); k.open = sl.length - 1; k.prev = k.open; }
  if (act === 'kar-del' && sl.length > MIN_SLIDES) { sl.splice(i, 1); k.prev = Math.min(k.prev, sl.length - 1); }
  if (act === 'kar-up' && i > 0) { [sl[i - 1], sl[i]] = [sl[i], sl[i - 1]]; k.open = i - 1; k.prev = i - 1; }
  if (act === 'kar-down' && i < sl.length - 1) { [sl[i + 1], sl[i]] = [sl[i], sl[i + 1]]; k.open = i + 1; k.prev = i + 1; }
  if (act === 'kar-item-add') { sl[i].items.push({ label: '', text: 'Yeni madde' }); k.open = i; }
  if (act === 'kar-item-del') { sl[i].items.splice(j, 1); sl[i] = normalizeSlide(sl[i], i, sl.length); k.open = i; }
  k.sample = false; kOutReset(); draw();
}

async function kRender(btn) {
  const k = s.kar, err = el.querySelector('#k-error');
  const risky = deckFindings(k.deck).filter(x => x.level === 'yuksek');
  if (risky.length && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; err.textContent = 'Metinde marka kuralına takılan ifade var. Düzelt ya da yine de üretmek için tekrar dokun.'; return; }
  err.textContent = ''; btn.dataset.confirm = '';
  kOutReset(); k.busy = true; btn.disabled = true; btn.textContent = 'Üretiliyor…';
  try {
    const res = await renderDeck(k.deck, k.photo, p => { const b = el.querySelector('#k-prog'); if (b) b.style.width = Math.round(p * 100) + '%'; }, k.logo);
    k.out = res.map(r => ({ ...r, url: URL.createObjectURL(r.blob) }));
    toast(`${k.out.length} görsel hazır.`);
  } catch (e) { const x = el.querySelector('#k-error'); if (x) x.textContent = 'Üretilemedi: ' + e.message; }
  k.busy = false;
  if (s.tab === 'karusel') draw();
}

async function kShare() {
  const files = s.kar.out.map(o => new File([o.blob], o.name, { type: 'image/png' }));
  const text = suggestCaptionK(s.kar.deck);
  try { await navigator.clipboard?.writeText(text); } catch { /* izin yok */ }
  try { await navigator.share({ files, text }); toast('Açıklama metni panoya da kopyalandı.'); }
  catch (e) { if (e.name !== 'AbortError') toast('Paylaşılamadı; ZIP olarak indirip galeriden paylaşabilirsin.'); }
}

async function kZip(btn) {
  const out = s.kar.out; if (!out.length) return;
  btn.disabled = true;
  try {
    const { default: JSZip } = await import('https://esm.sh/jszip@3.10.1');
    const zip = new JSZip();
    out.forEach(o => zip.file(o.name, o.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = out[0].name.replace(/-01\.png$/, '.zip'); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    // ZIP yüklenemezse tek tek indir
    for (const o of out) { const a = document.createElement('a'); a.href = o.url; a.download = o.name; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r => setTimeout(r, 350)); }
  }
  btn.disabled = false;
}

async function kToCalendar(btn) {
  const k = s.kar, err = el.querySelector('#k-error');
  err.textContent = ''; btn.disabled = true;
  const topic = (k.deck.topic.trim() || String(k.deck.slides[0]?.title || 'Karusel').replace(/\*/g, '')).slice(0, 200);
  const carousel = { ...k.deck, topic };
  const row = { topic, format: 'karusel', carousel };
  const q = k.postId ? supabase.from('content_posts').update(row).eq('id', k.postId).select().single()
    : supabase.from('content_posts').insert({ ...row, org_id: ctx.org.id, planned_for: todayISO(), platform: 'Instagram',
      pillar: 'ogretici', status: k.out.length ? 'hazir' : 'taslak', caption: suggestCaptionK(k.deck) }).select().single();
  const { data, error } = await q;
  btn.disabled = false;
  if (error) { err.textContent = trError(error); return; }
  s.posts = (k.postId ? s.posts.map(x => (x.id === data.id ? data : x)) : [...s.posts, data]).sort((a, b) => (a.planned_for < b.planned_for ? -1 : 1));
  k.postId = data.id; k.deck.topic = data.topic;
  draw();
  toast(k.out.length ? 'Karusel takvime "Hazır" olarak kaydedildi.' : 'Karusel takvime taslak olarak kaydedildi.');
}

function kOpen(id) {
  const p = s.posts.find(x => x.id === id);
  if (!p || !p.carousel) return;
  const dlg = el.querySelector('#p-dialog'); if (dlg?.open) dlg.close();
  kOutReset();
  const brand = s.kar.deck.brand;
  s.kar.deck = normalizeDeck({ ...p.carousel, brand: { ...brand, ...(p.carousel.brand || {}) } });
  s.kar.postId = p.id; s.kar.prev = 0; s.kar.open = 0; s.kar.sample = false;
  s.tab = 'karusel'; history.replaceState(null, '', '#/pazarlama?tab=karusel'); draw();
}

function kNew() {
  if (s.kar.busy) return;
  kOutReset();
  const { photo, photoData, logo, logoData } = s.kar, brand = s.kar.deck.brand;
  initKar(); Object.assign(s.kar, { photo, photoData, logo, logoData });
  s.kar.deck = sampleDeck(brand);
  draw();
}

async function kPhoto(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Bir fotoğraf seç.'); return; }
  try {
    s.kar.photoData = await shrinkPhoto(file);
    s.kar.photo = await imageFromData(s.kar.photoData);
    kSaveBrand(); kOutReset(); draw();
  } catch (e) { toast(e.message); }
}

async function kLogo(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Bir görsel seç.'); return; }
  try {
    s.kar.logoData = await shrinkLogo(file);
    s.kar.logo = await imageFromData(s.kar.logoData);
    kSaveBrand(); kOutReset(); draw();
  } catch (e) { toast(e.message); }
}

// ====================================================================
// Instagram'a doğrudan yayın (Composio, sunucu fonksiyonu 'instagram')
async function igStatus() {
  const k = s.kar;
  if (k.ig && (k.ig.state === 'ready' || k.ig.state === 'checking')) return k.ig;
  k.ig = { state: 'checking' };
  try {
    const { data, error } = await supabase.functions.invoke('instagram', { body: { action: 'status' } });
    if (error) {
      let j = null; try { j = await error.context?.json?.(); } catch { /* yok */ }
      k.ig = { state: j?.error || 'error', message: j?.message || error.message };
    } else k.ig = { state: 'ready', username: data.username };
  } catch (e) { k.ig = { state: 'error', message: e.message }; }
  const box = el?.querySelector('#ig-box'); if (box) box.outerHTML = igButtonHtml();
  return k.ig;
}

function igButtonHtml() {
  const ig = s.kar.ig;
  if (!ig || (ig.state !== 'ready' && ig.state !== 'checking' && ig.state !== 'not_allowed' && !ig.shown)) {
    if (ig) ig.shown = true; else igStatus();
    if (!ig) return '<div id="ig-box"></div>';
  }
  if (ig.state === 'ready') return `<div id="ig-box"><button type="button" class="btn btn-primary" data-act="kar-ig"><i class="ti ti-send" aria-hidden="true"></i> @${esc(ig.username)} hesabında yayınla</button></div>`;
  if (ig.state === 'not_allowed' || ig.state === 'checking') return '<div id="ig-box"></div>';
  if (ig.state === 'no_key') return '<div id="ig-box"><p class="small muted">Doğrudan yayın için sunucuya Composio anahtarı (COMPOSIO_API_KEY) eklenmeli.</p></div>';
  return `<div id="ig-box"><p class="small error">Instagram bağlantısı: ${esc(ig.message || 'kontrol edilemedi')}</p>
    <button type="button" class="btn btn-ghost sm" data-act="ig-retry"><i class="ti ti-refresh" aria-hidden="true"></i> Bağlantıyı tekrar dene</button></div>`;
}

function igDialog() {
  const k = s.kar;
  if (!k.out.length) return;
  if (k.out.length < 2) { toast('Karusel en az 2 sayfa olmalı.'); return; }
  const dlg = el.querySelector('#p-dialog');
  dlg.innerHTML = `<form method="dialog" class="sheet-body ig-dlg" onsubmit="return false">
    <h2 id="p-dialog-title"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${esc(k.ig.username)} hesabında yayınla</h2>
    <div class="kar-thumbs">${k.out.map((o, i) => `<img src="${o.url}" alt="${i + 1}. sayfa">`).join('')}</div>
    <p class="small muted">${k.out.length} sayfa, gördüğün sırayla yayınlanır.</p>
    <div class="field"><label for="ig-cap">Açıklama metni</label><textarea id="ig-cap" rows="8" maxlength="2200">${esc(suggestCaptionK(k.deck))}</textarea>
      <p class="small muted"><span id="ig-len"></span> / 2200</p></div>
    <div id="ig-check"></div>
    <label class="check"><input type="checkbox" id="ig-ok"> <span>Bu gönderi herkese açık yayınlanacak ve <strong>buradan geri alınamaz</strong>. Görselleri ve metni kontrol ettim.</span></label>
    <p class="small muted">Müzik eklenemez; müzik istiyorsan telefondan paylaş.</p>
    <p class="error" id="ig-error" role="alert"></p>
    <div class="quick"><button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button type="button" class="btn btn-gold" data-act="ig-publish" id="ig-go" disabled><i class="ti ti-send" aria-hidden="true"></i> Yayınla</button></div>
  </form>`;
  dlg.showModal();
  igUpdate();
}

function igFindings() {
  const cap = el.querySelector('#ig-cap')?.value || '';
  return [...deckFindings(s.kar.deck), ...checkMessage(cap)].filter(x => x.level === 'yuksek');
}
function igUpdate() {
  const cap = el.querySelector('#ig-cap'); if (!cap) return;
  el.querySelector('#ig-len').textContent = cap.value.length;
  const f = igFindings();
  el.querySelector('#ig-check').innerHTML = f.length
    ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}" — ${esc(x.tip)}</p>`).join('')}<p><strong>Marka filtresi uyarısı varken yayınlanamaz.</strong></p></div>`
    : '<div class="check-box ok"><i class="ti ti-shield-check" aria-hidden="true"></i> Marka ve uyum kontrolü: sorun yok</div>';
  el.querySelector('#ig-go').disabled = !!f.length || !el.querySelector('#ig-ok').checked;
}

async function igPublish(btn) {
  const k = s.kar, err = el.querySelector('#ig-error');
  const caption = el.querySelector('#ig-cap').value.trim();
  if (igFindings().length || !el.querySelector('#ig-ok').checked) return;
  btn.disabled = true; err.textContent = '';
  const step = t => { btn.innerHTML = `<i class="ti ti-loader-2" aria-hidden="true"></i> ${t}`; };
  const uploaded = [];
  try {
    // Takvim kaydı yoksa önce kaydet (yayın bağlantısı oraya yazılır)
    if (!k.postId) {
      step('Takvime kaydediliyor…');
      const topic = (k.deck.topic.trim() || String(k.deck.slides[0]?.title || 'Karusel').replace(/\*/g, '')).slice(0, 200);
      const { data, error } = await supabase.from('content_posts').insert({ org_id: ctx.org.id, planned_for: todayISO(), platform: 'Instagram',
        pillar: 'ogretici', status: 'hazir', format: 'karusel', topic, caption: caption.slice(0, 2200), carousel: { ...k.deck, topic } }).select().single();
      if (error) throw new Error(trError(error));
      k.postId = data.id; s.posts = [...s.posts, data];
    }
    step('Görseller hazırlanıyor…');
    const jpgs = await renderDeck(k.deck, k.photo, () => {}, k.logo, 'image/jpeg');
    step('Yükleniyor…');
    const stamp = Date.now();
    for (let i = 0; i < jpgs.length; i++) {
      const path = `${ctx.user.id}/${stamp}-${String(i + 1).padStart(2, '0')}.jpg`;
      const { error } = await supabase.storage.from('ig-temp').upload(path, jpgs[i].blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error('Görsel yüklenemedi: ' + error.message);
      uploaded.push(path);
    }
    step('Instagram\'da yayınlanıyor…');
    const { data, error } = await supabase.functions.invoke('instagram', { body: { action: 'publish', paths: uploaded, caption, post_id: k.postId } });
    if (error) { let j = null; try { j = await error.context?.json?.(); } catch { /* yok */ } throw new Error(j?.message || error.message); }
    uploaded.length = 0; // sunucu sildi
    s.posts = s.posts.map(p => (p.id === k.postId ? { ...p, status: 'paylasildi', ig_permalink: data.permalink, published_at: new Date().toISOString() } : p));
    el.querySelector('#p-dialog').innerHTML = `<div class="sheet-body"><h2><i class="ti ti-circle-check" aria-hidden="true"></i> Yayınlandı</h2>
      <p>Karusel @${esc(k.ig.username)} hesabında yayında ve takvimde "Paylaşıldı" olarak işaretlendi.</p>
      ${data.permalink ? `<p><a class="btn btn-gold" href="${esc(data.permalink)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Gönderiyi aç</a></p>` : ''}
      <div class="quick"><button type="button" class="btn btn-ghost" data-act="close">Kapat</button></div></div>`;
    toast('Karusel Instagram\'da yayınlandı.');
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-send" aria-hidden="true"></i> Tekrar dene';
    if (uploaded.length) supabase.storage.from('ig-temp').remove(uploaded).catch(() => {});
  }
}
