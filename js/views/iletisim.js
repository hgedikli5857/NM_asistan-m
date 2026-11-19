// İletişim birimi: mesaj oluştur, şablon kütüphanesi, itiraz rehberi
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { PURPOSES, purposeLabel, SYSTEM_TEMPLATES, OBJECTIONS } from '../iletisim/content.js';
import { checkMessage, fillTemplate } from '../iletisim/uyum.js';
import { CHANNELS, waNumber, addDays, stageLabel } from '../kazanim/model.js';
import { pickerHTML, bindPicker } from '../ui/picker.js';
import { SCENARIOS, MAX_TURNS, systemPrompt, feedbackPrompt, apiMessages } from '../iletisim/pratik.js';
import { aiChat, aiAvailable, extractJSON, ensureShareConsent, prospectBrief, ETHICS, getApiKey, AI_KEY } from '../ai/client.js';
import { TEMPS } from '../kazanim/model.js';

const TABS = [
  { id: 'yaz', label: 'Mesaj yaz', icon: 'ti-pencil' },
  { id: 'cevap', label: 'Cevap öner', icon: 'ti-sparkles' },
  { id: 'sablon', label: 'Şablonlar', icon: 'ti-template' },
  { id: 'itiraz', label: 'İtiraz rehberi', icon: 'ti-shield-question' },
  { id: 'pratik', label: 'Pratik', icon: 'ti-messages' }
];
export { AI_KEY, getApiKey };

let el, ctx;
let state = { tab: 'yaz', prospects: [], mine: [], purpose: '', prospectId: '', text: '', filterPurpose: '', ai: false, reply: { goal: 'auto', input: '', result: null, busy: false, error: '' } };

export async function renderIletisim(target, context) {
  el = target; ctx = context;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (TABS.some(t => t.id === params.get('tab'))) state.tab = params.get('tab');
  if (params.get('aday')) { state.prospectId = params.get('aday'); state.tab = 'yaz'; }

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Aday ve büyüme</div><h1>İletişim</h1>
        <p class="muted">Ne diyeceğim? Şablonlar, itiraz rehberi ve uyum kontrolü.</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="İletişim sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="i-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>
    <dialog id="i-dialog" class="sheet" aria-labelledby="i-dialog-title"></dialog>`;

  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);

  const [p, s] = await Promise.all([
    supabase.from('prospects').select('id, full_name, phone, instagram, stage, occupation, interests, notes, next_follow_up_at')
      .is('deleted_at', null).order('full_name').limit(2000),
    supabase.from('scripts').select('*').order('created_at', { ascending: false })
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  state.prospects = p.data;
  state.mine = s.data;
  state.ai = await aiAvailable();
  // Başka sayfadan gönderilen taslak (Koç / Liste çalışması)
  try {
    const draft = JSON.parse(sessionStorage.getItem('nmd_draft') || 'null');
    if (draft) { sessionStorage.removeItem('nmd_draft'); state.tab = 'yaz'; state.text = draft.text || ''; if (draft.prospectId) state.prospectId = draft.prospectId; }
  } catch { /* yok */ }
  draw();
}

// Sistem şablonları + kendi/ekip şablonları tek listede
function allTemplates() {
  const own = state.mine.map(t => ({ id: t.id, purpose: t.purpose, channel: t.channel, title: t.title, body: t.body,
    own: t.owner_id === ctx.user.id, shared: t.is_shared }));
  return [...own, ...SYSTEM_TEMPLATES];
}
const myName = () => firstName(ctx.profile?.full_name);
// İsim başındaki !, *, nokta gibi işaretleri at, ilk kelimeyi al
export const firstName = n => String(n || '').replace(/^[^\p{L}\d]+/u, '').trim().split(/\s+/)[0] || '';
const currentProspect = () => state.prospects.find(p => p.id === state.prospectId) || null;

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  const body = el.querySelector('#i-body');
  body.innerHTML = state.tab === 'yaz' ? viewCompose() : state.tab === 'sablon' ? viewLibrary() : state.tab === 'pratik' ? viewPractice() : state.tab === 'cevap' ? viewReply() : viewObjections();
  if (state.tab === 'yaz') { renderCheck(); bindPicker(el, { id: 'i-pick', prospects: state.prospects, onSelect: selectProspect }); }
  if (state.tab === 'cevap') bindPicker(el, { id: 'r-pick', prospects: state.prospects, onSelect: p => { state.prospectId = p ? p.id : ''; } });
}

// ====================================================================
// Mesaj yaz
function viewCompose() {
  const p = currentProspect();
  const list = allTemplates().filter(t => !state.purpose || t.purpose === state.purpose).slice(0, 12);
  const hasKey = state.ai;
  return `
  <div class="compose">
    <section class="card">
      <h2><i class="ti ti-user" aria-hidden="true"></i> Kime?</h2>
      <div class="field" style="margin-bottom:6px">
        ${pickerHTML({ id: 'i-pick', label: 'Aday seç (isteğe bağlı)', prospects: state.prospects, selectedId: state.prospectId })}
      </div>
      ${p ? `<p class="small muted">${[p.occupation, p.interests].filter(Boolean).map(esc).join(' · ') || 'Ek bilgi yok'}</p>` : ''}

      <h2 style="margin-top:16px"><i class="ti ti-template" aria-hidden="true"></i> Şablon seç</h2>
      <div class="chips" role="group" aria-label="Amaç">
        <button class="chip" data-purpose="" aria-pressed="${!state.purpose}">Hepsi</button>
        ${PURPOSES.filter(x => x.id !== 'itiraz').map(x => `<button class="chip" data-purpose="${x.id}" aria-pressed="${state.purpose === x.id}">${x.label}</button>`).join('')}
      </div>
      <div class="tpl-list">
        ${list.map(t => `<button class="tpl" data-use="${t.id}">
          <span class="tpl-title">${esc(t.title)}</span>
          <span class="tpl-meta">${esc(purposeLabel(t.purpose))}${t.channel ? ' · ' + esc(t.channel) : ''}${t.own ? ' · <b>benim</b>' : ''}</span>
          <span class="tpl-body">${esc(fillTemplate(t.body, { isim: firstName(p?.full_name), ben: myName() }))}</span>
        </button>`).join('') || '<p class="muted small">Bu amaçta şablon yok.</p>'}
      </div>
    </section>

    <section class="card compose-editor">
      <h2><i class="ti ti-message" aria-hidden="true"></i> Mesaj</h2>
      <div class="field">
        <label for="i-text" class="sr-only">Mesaj metni</label>
        <textarea id="i-text" rows="7" placeholder="Bir şablon seç ya da kendin yaz…">${esc(state.text)}</textarea>
      </div>
      <div id="i-check" aria-live="polite"></div>
      <div class="quick">
        <button class="btn btn-ghost" data-act="copy"><i class="ti ti-copy" aria-hidden="true"></i> Kopyala</button>
        <button class="btn btn-ghost" data-act="wa"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp'ta aç</button>
        ${hasKey ? `<button class="btn btn-ghost" data-act="ai"><i class="ti ti-sparkles" aria-hidden="true"></i> AI ile kişiselleştir</button>` : ''}
        ${p ? `<button class="btn btn-primary" data-act="log"><i class="ti ti-check" aria-hidden="true"></i> Gönderdim, kaydet</button>` : ''}
      </div>
      ${hasKey ? '' : `<p class="small muted" style="margin-top:10px">AI özellikleri için <a href="#/ayarlar">Ayarlar → AI asistan</a> bölümüne bak.</p>`}
      <p class="hint-box" style="margin-top:12px"><i class="ti ti-bulb" aria-hidden="true"></i>
        Mesajda her şeyi anlatma. Amaç merak uyandırıp görüşmeye davet etmek; detaylar canlı görüşmede.</p>
    </section>
  </div>`;
}

function renderCheck() {
  const box = el.querySelector('#i-check');
  if (!box) return;
  const text = state.text.trim();
  if (!text) { box.innerHTML = ''; return; }
  const findings = checkMessage(text);
  const words = text.split(/\s+/).length;
  const long = words > 70;
  box.innerHTML = findings.length || long ? `
    <div class="check-box warn">
      ${findings.map(f => `<p><strong><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(f.cat)}:</strong>
        "${f.hits.map(esc).join('", "')}" — ${esc(f.tip)}</p>`).join('')}
      ${long ? `<p><strong><i class="ti ti-text-size" aria-hidden="true"></i> Uzun mesaj (${words} kelime):</strong> Bilgi yüklemesi görüşme davetini zayıflatır. 2-3 cümlede kal.</p>` : ''}
    </div>` : `<div class="check-box ok"><i class="ti ti-shield-check" aria-hidden="true"></i> Uyum kontrolü: sorun görünmüyor · ${words} kelime</div>`;
}

// ====================================================================
// Şablon kütüphanesi
function viewLibrary() {
  const list = allTemplates().filter(t => !state.filterPurpose || t.purpose === state.filterPurpose);
  return `
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Amaç filtresi">
        <button class="chip" data-fpurpose="" aria-pressed="${!state.filterPurpose}">Hepsi</button>
        ${PURPOSES.map(x => `<button class="chip" data-fpurpose="${x.id}" aria-pressed="${state.filterPurpose === x.id}">${x.label}</button>`).join('')}
      </div>
      <button class="btn btn-gold" data-act="new-tpl" style="margin-left:auto"><i class="ti ti-plus" aria-hidden="true"></i> Kendi şablonum</button>
    </div>
    <div class="grid lib-grid">
      ${list.map(t => `<article class="card tpl-card">
        <header><h3>${esc(t.title)}</h3>
          <span class="badge ${t.own ? 'gold' : ''}">${t.own ? (t.shared ? 'Benim · ekiple paylaşılan' : 'Benim') : (t.shared ? 'Ekip' : 'Sistem')}</span></header>
        <p class="small muted">${esc(purposeLabel(t.purpose))}${t.channel ? ' · ' + esc(t.channel) : ''}</p>
        <p class="tpl-text">${esc(t.body)}</p>
        <footer>
          <button class="btn btn-ghost" data-use="${t.id}"><i class="ti ti-send" aria-hidden="true"></i> Kullan</button>
          ${t.own ? `<button class="icon-btn" data-act="edit-tpl" data-id="${t.id}" aria-label="Düzenle"><i class="ti ti-pencil" aria-hidden="true"></i></button>
            <button class="icon-btn" data-act="del-tpl" data-id="${t.id}" aria-label="Sil"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}
        </footer>
      </article>`).join('')}
    </div>`;
}

function templateDialog(t = null) {
  const v = t || { purpose: 'ilk_temas', is_shared: false };
  const d = el.querySelector('#i-dialog');
  d.innerHTML = `
    <form data-form="tpl" data-id="${t ? t.id : ''}" novalidate>
      <header class="sheet-head"><h2 id="i-dialog-title">${t ? 'Şablonu düzenle' : 'Yeni şablon'}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
      <div class="sheet-body">
        <div class="field"><label for="t-title">Başlık *</label><input id="t-title" name="title" value="${esc(v.title)}" maxlength="80" autofocus></div>
        <div class="form-2">
          <div class="field"><label for="t-purpose">Amaç</label><select id="t-purpose" name="purpose">
            ${PURPOSES.map(x => `<option value="${x.id}" ${v.purpose === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
          <div class="field"><label for="t-channel">Kanal</label><select id="t-channel" name="channel"><option value="">Hepsi</option>
            ${CHANNELS.map(c => `<option ${v.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="t-body">Metin *</label>
          <textarea id="t-body" name="body" rows="5" placeholder="Selam {isim}! …">${esc(v.body)}</textarea>
          <span class="small muted">{isim} adayın adıyla, {ben} senin adınla değişir.</span></div>
        <div id="t-check"></div>
        <label class="check"><input type="checkbox" name="is_shared" ${v.is_shared ? 'checked' : ''}><span>Ekibimle paylaş</span></label>
        <p class="error" id="t-error" role="alert"></p>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
        <button type="submit" class="btn btn-primary">Kaydet</button>
      </footer>
    </form>`;
  d.showModal();
  d.querySelector('[autofocus]')?.focus();
  updateTplCheck();
}

function updateTplCheck() {
  const ta = el.querySelector('#t-body');
  const box = el.querySelector('#t-check');
  if (!ta || !box) return;
  const f = checkMessage(ta.value);
  box.innerHTML = f.length ? `<div class="check-box warn">${f.map(x => `<p><strong>${esc(x.cat)}:</strong> "${x.hits.map(esc).join('", "')}"</p>`).join('')}</div>` : '';
}

// ====================================================================
// İtiraz rehberi
function viewObjections() {
  return `
    <p class="small muted">Önce dinle, sonra soruyu anla, en son yanıtla. Her itiraz bir sorunun kılık değiştirmiş hâlidir.</p>
    <div class="obj-list">
      ${OBJECTIONS.map(o => `<details class="card obj">
        <summary><span>${esc(o.title)}</span><i class="ti ti-chevron-down" aria-hidden="true"></i></summary>
        <p><strong>Arkasındaki kaygı:</strong> ${esc(o.behind)}</p>
        <ol>${o.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <blockquote>${esc(fillTemplate(o.reply, { isim: 'Ayşe', ben: myName() }))}</blockquote>
        <button class="btn btn-ghost" data-obj="${o.id}"><i class="ti ti-send" aria-hidden="true"></i> Bu yanıtı kullan</button>
      </details>`).join('')}
    </div>`;
}

// ====================================================================
// Olaylar
function onClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; history.replaceState(null, '', `#/iletisim?tab=${state.tab}`); draw(); return; }
  const pur = t.closest('[data-purpose]');
  if (pur) { state.purpose = pur.dataset.purpose; draw(); return; }
  const fp = t.closest('[data-fpurpose]');
  if (fp) { state.filterPurpose = fp.dataset.fpurpose; draw(); return; }
  const use = t.closest('[data-use]');
  if (use) { useTemplate(allTemplates().find(x => String(x.id) === use.dataset.use)?.body); return; }
  const ru = t.closest('[data-ruse]');
  if (ru) { useTemplate(state.reply.result.secenekler[+ru.dataset.ruse].mesaj); return; }
  const rc = t.closest('[data-rcopy]');
  if (rc) { navigator.clipboard.writeText(state.reply.result.secenekler[+rc.dataset.rcopy].mesaj).then(() => toast('Kopyalandı.')); return; }
  const obj = t.closest('[data-obj]');
  if (obj) { useTemplate(OBJECTIONS.find(x => x.id === obj.dataset.obj)?.reply); return; }

  const b = t.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'copy': copyText(); break;
    case 'wa': openWhatsApp(); break;
    case 'log': logSent(b); break;
    case 'ai': aiPersonalize(b); break;
    case 'new-tpl': templateDialog(); break;
    case 'edit-tpl': templateDialog(state.mine.find(x => x.id === b.dataset.id)); break;
    case 'del-tpl': deleteTemplate(b); break;
    case 'close': el.querySelector('#i-dialog').close(); break;
    case 'sc-start': startPractice(b.dataset.id); break;
    case 'r-save': saveReplyState(b); break;
    case 'r-temp': setReplyTemp(); break;
    case 'sc-end': endPractice(b); break;
    case 'sc-reset': state.practice = null; draw(); break;
  }
}

function onInput(e) {
  if (e.target.id === 'i-text') { state.text = e.target.value; renderCheck(); }
  if (e.target.id === 't-body') updateTplCheck();
}

function onChange() {}

function selectProspect(p) {
  const prevName = firstName(currentProspect()?.full_name);
  state.prospectId = p ? p.id : '';
  // Metinde önceki adayın adı ya da [isim] geçiyorsa yenisiyle değiştir
  if (p) {
    const first = firstName(p.full_name);
    state.text = state.text.replace(/\[isim\]/g, first);
    if (prevName && prevName !== first) state.text = state.text.split(prevName).join(first);
  }
  draw();
}

function useTemplate(body) {
  if (!body) return;
  const p = currentProspect();
  state.text = fillTemplate(body, { isim: firstName(p?.full_name), ben: myName() });
  state.tab = 'yaz';
  history.replaceState(null, '', '#/iletisim?tab=yaz');
  draw();
  const ta = el.querySelector('#i-text');
  ta?.focus();
  ta?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function textOrWarn() {
  const text = state.text.trim();
  if (!text) { toast('Önce bir mesaj yaz ya da şablon seç.'); return null; }
  if (text.includes('[isim]')) toast('Uyarı: metinde hâlâ [isim] var.');
  return text;
}

async function copyText() {
  const text = textOrWarn(); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast('Mesaj kopyalandı.'); }
  catch { toast('Kopyalanamadı; metni seçip elle kopyala.'); }
}

function openWhatsApp() {
  const text = textOrWarn(); if (!text) return;
  const num = waNumber(currentProspect()?.phone);
  window.open(`https://wa.me/${num || ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

async function logSent(btn) {
  const p = currentProspect();
  const text = textOrWarn(); if (!text || !p) return;
  btn.disabled = true;
  const { error } = await supabase.from('interactions').insert({
    org_id: ctx.org.id, prospect_id: p.id, kind: 'mesaj', channel: 'WhatsApp', summary: text.slice(0, 280)
  });
  if (error) { btn.disabled = false; toast(trError(error)); return; }
  // Takip planlı değilse ya da geçmişte kaldıysa 3 gün sonraya planla
  const patch = {};
  if (!p.next_follow_up_at || new Date(p.next_follow_up_at) < new Date()) patch.next_follow_up_at = addDays(3).toISOString();
  if (p.stage === 'liste') patch.stage = 'temas';
  if (Object.keys(patch).length) {
    const { data } = await supabase.from('prospects').update(patch).eq('id', p.id).select().single();
    if (data) state.prospects = state.prospects.map(x => (x.id === p.id ? { ...x, ...data } : x));
  }
  btn.disabled = false;
  toast(`${p.full_name} için temas kaydedildi${patch.next_follow_up_at ? ', takip 3 gün sonra' : ''}.`);
}

async function deleteTemplate(btn) {
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.classList.add('btn-danger'); toast('Silmek için tekrar dokun.'); return; }
  const { error } = await supabase.from('scripts').delete().eq('id', btn.dataset.id);
  if (error) { toast(trError(error)); return; }
  state.mine = state.mine.filter(x => x.id !== btn.dataset.id);
  draw(); toast('Şablon silindi.');
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'chat') return sendChat(form);
  if (form.dataset.form === 'reply') return suggestReply(form);
  if (form.dataset.form !== 'tpl') return;
  const f = n => form.elements.namedItem(n);
  const err = form.querySelector('#t-error');
  const title = f('title').value.trim();
  const body = f('body').value.trim();
  if (!title || !body) { err.textContent = 'Başlık ve metin zorunlu.'; return; }
  const risky = checkMessage(body).filter(x => x.level === 'yuksek');
  const submit = form.querySelector('[type="submit"]');
  if (risky.length && submit.dataset.confirm !== '1') {
    submit.dataset.confirm = '1';
    err.textContent = 'Metinde yüksek riskli ifade var. Yine de kaydetmek için tekrar dokun.';
    return;
  }
  err.textContent = '';
  submit.disabled = true;
  const payload = { title, body, purpose: f('purpose').value, channel: f('channel').value || null, is_shared: f('is_shared').checked };
  const id = form.dataset.id;
  const q = id
    ? supabase.from('scripts').update(payload).eq('id', id).select().single()
    : supabase.from('scripts').insert({ ...payload, org_id: ctx.org.id, owner_id: ctx.user.id }).select().single();
  const { data, error } = await q;
  submit.disabled = false;
  if (error) { err.textContent = trError(error); return; }
  state.mine = id ? state.mine.map(x => (x.id === id ? data : x)) : [data, ...state.mine];
  el.querySelector('#i-dialog').close();
  draw();
  toast('Şablon kaydedildi.');
}

// ====================================================================
// AI ile kişiselleştirme (anahtar yalnızca bu tarayıcıda saklanır)
async function aiPersonalize(btn) {
  const p = currentProspect();
  const draft = state.text.trim();
  if (!draft) { toast('Önce bir şablon seç ya da taslak yaz.'); return; }
  if (p && !ensureShareConsent()) return;
  btn.disabled = true;
  const old = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  try {
    state.text = await aiChat({ maxTokens: 400, messages: [{ role: 'user', content:
      `Bir network marketing distribütörü için WhatsApp mesajını kişiselleştir. ${ETHICS}\nSadece mesaj metnini yaz, açıklama ekleme.\n\nAday: ${p ? prospectBrief(p) : 'bilgi yok'}\n\nTaslak:\n${draft}` }] });
    draw();
    toast('AI önerisi hazır. Göndermeden önce oku ve düzenle.');
  } catch (err) {
    toast('AI hatası: ' + (err.message || err));
    btn.disabled = false; btn.innerHTML = old;
  }
}

// ====================================================================
// Cevap öner: durumu anlat ya da adayın mesajını yapıştır → AI 3 yanıt önerir
const GOALS = { auto: 'Sen karar ver', davet: 'Görüşmeye davet', itiraz: 'İtirazı yanıtla', takip: 'Sohbeti sürdür', kapat: 'Nazikçe kapat' };
const INTENT = { ilgili: ['İlgili', 'ok'], kararsiz: ['Kararsız', 'gold'], itiraz: ['İtirazı var', 'warn'], ilgisiz: ['İlgisiz', ''], belirsiz: ['Belirsiz', ''] };

function viewReply() {
  const r = state.reply;
  if (!state.ai) return `<div class="card empty"><i class="ti ti-sparkles" aria-hidden="true"></i><h2>AI henüz kurulmadı</h2>
    <p class="muted">Cevap önerisi için AI gerekiyor. Ayarlar → AI asistan bölümünden kurabilirsin.</p><a class="btn btn-gold" href="#/ayarlar">Ayarlara git</a></div>`;
  const res = r.result;
  const cp = currentProspect();
  return `<div class="compose">
    <form class="card" data-form="reply" novalidate>
      <h2><i class="ti ti-message-question" aria-hidden="true"></i> Ne oldu?</h2>
      <div class="field">${pickerHTML({ id: 'r-pick', label: 'Kiminle yazışıyorsun? (isteğe bağlı)', prospects: state.prospects, selectedId: state.prospectId })}</div>
      <div class="field"><label for="r-input">Adayın son mesajını yapıştır ya da durumu anlat *</label>
        <textarea id="r-input" name="input" rows="6" maxlength="3000" placeholder="Ör. Sunumu izledi, 'güzel ama şu an param yok, belki sonra' yazdı. 2 gündür cevap vermiyor.">${esc(r.input)}</textarea></div>
      <fieldset class="field"><legend>Amacın</legend><div class="chips">
        ${Object.entries(GOALS).map(([k, l]) => `<label class="chip"><input type="radio" name="goal" value="${k}" ${r.goal === k ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>
      <p class="error" id="r-error" role="alert">${esc(r.error)}</p>
      <button class="btn btn-primary" type="submit" ${r.busy ? 'disabled' : ''}><i class="ti ti-sparkles" aria-hidden="true"></i> ${r.busy ? 'Düşünüyor…' : 'Cevap öner'}</button>
      <p class="small muted" style="margin-top:10px">Ne kadar ayrıntı verirsen öneri o kadar isabetli olur: ne zaman tanıştınız, neyle ilgilendi, ne dedi.</p>
    </form>
    <section class="card">
      ${res ? `
        <h2><i class="ti ti-eye" aria-hidden="true"></i> Durum okuması</h2>
        <p>${INTENT[res.niyet] ? `<span class="badge ${INTENT[res.niyet][1]}">${INTENT[res.niyet][0]}</span> ` : ''}${TEMPS[res.sicaklik] ? `<span class="badge ${TEMPS[res.sicaklik].cls}">${TEMPS[res.sicaklik].label}</span>` : ''}</p>
        <p>${esc(res.analiz)}</p>
        <h3>Önerilen cevaplar</h3>
        ${(res.secenekler || []).map((o, i) => {
          const f = checkMessage(o.mesaj);
          return `<article class="reply-opt">
            <header><strong>${esc(o.baslik || 'Seçenek ' + (i + 1))}</strong>${f.length ? '<span class="badge warn">Uyum uyarısı</span>' : '<span class="badge ok">Uyumlu</span>'}</header>
            <p>${esc(o.mesaj)}</p>
            <div class="quick"><button class="btn btn-ghost sm" data-ruse="${i}"><i class="ti ti-pencil" aria-hidden="true"></i> Düzenle ve gönder</button>
              <button class="btn btn-ghost sm" data-rcopy="${i}"><i class="ti ti-copy" aria-hidden="true"></i> Kopyala</button></div></article>`;
        }).join('')}
        ${res.sonraki_adim ? `<div class="hint-box"><i class="ti ti-arrow-right-circle" aria-hidden="true"></i><span><strong>Sonraki adım:</strong> ${esc(res.sonraki_adim)}
          ${res.takip_gun ? ` · Takip: ${res.takip_gun} gün sonra` : ''}</span></div>` : ''}
        ${cp ? `<div class="quick" style="margin-top:12px">
          <button class="btn btn-primary" data-act="r-save"><i class="ti ti-device-floppy" aria-hidden="true"></i> Durumu kaydet${res.takip_gun ? ' + takip planla' : ''}</button>
          ${TEMPS[res.sicaklik] && res.sicaklik !== cp.temperature ? `<button class="btn btn-ghost" data-act="r-temp">Sıcaklığı "${TEMPS[res.sicaklik].label}" yap</button>` : ''}</div>` : ''}`
      : `<div class="empty"><i class="ti ti-bulb" aria-hidden="true"></i><h2>Nasıl çalışır?</h2>
        <p class="muted">Durumu anlat; AI adayın niyetini okur, görüşmeye yönlendiren 3 farklı cevap ve sonraki adımı önerir.
        Cevaplar uyum kontrolünden geçer. Göndermeden önce mutlaka kendi cümlelerine göre düzenle.</p></div>`}
    </section></div>`;
}

export function buildReplyPrompt({ goal, input, brief, history }) {
  return `Sen deneyimli, etik bir network marketing sponsorusun. Distribütör bir adayla yazışıyor ve ne cevap vereceğini soruyor.
${ETHICS}
Amaç: ${GOALS[goal] || GOALS.auto}${goal === 'auto' ? ' (duruma en uygun olanı seç)' : ''}.
Aday: ${brief || 'bilinmiyor'}
${history ? 'Önceki temaslar:\n' + history : ''}
Distribütörün anlattığı / adayın mesajı:
«${input}»

Yalnızca şu JSON ile cevap ver, başka metin yazma:
{"analiz":"adayın gerçek kaygısı ve durumu, 2 cümle","niyet":"ilgili|kararsiz|itiraz|ilgisiz|belirsiz","sicaklik":"sicak|ilik|soguk","secenekler":[{"baslik":"kısa yaklaşım adı","mesaj":"gönderilecek mesaj"},{"baslik":"...","mesaj":"..."},{"baslik":"...","mesaj":"..."}],"sonraki_adim":"tek cümle","takip_gun":0}
takip_gun 0-14 arası bir sayı olsun.`;
}

async function suggestReply(form) {
  const r = state.reply;
  r.input = form.elements.namedItem('input').value.trim();
  r.goal = form.querySelector('[name="goal"]:checked')?.value || 'auto';
  if (r.input.length < 10) { r.error = 'Durumu biraz daha ayrıntılı anlat (en az bir cümle).'; draw(); return; }
  const p = currentProspect();
  if (p && !ensureShareConsent()) return;
  r.error = ''; r.busy = true; draw();
  let history = '';
  if (p) {
    const { data } = await supabase.from('interactions').select('kind, summary, occurred_at').eq('prospect_id', p.id)
      .order('occurred_at', { ascending: false }).limit(5);
    history = (data || []).filter(x => x.summary).map(x => `- ${new Date(x.occurred_at).toLocaleDateString('tr-TR')} ${x.kind}: ${String(x.summary).slice(0, 160)}`).join('\n');
  }
  try {
    const out = extractJSON(await aiChat({ maxTokens: 900, messages: [{ role: 'user', content:
      buildReplyPrompt({ goal: r.goal, input: r.input, brief: p ? prospectBrief(p) : '', history }) }] }));
    if (!Array.isArray(out.secenekler) || !out.secenekler.length) throw new Error('Öneri gelmedi, tekrar dene.');
    out.secenekler = out.secenekler.slice(0, 3).map(o => ({ baslik: String(o.baslik || ''), mesaj: String(o.mesaj || '') }));
    out.takip_gun = Math.max(0, Math.min(14, Math.round(+out.takip_gun || 0)));
    r.result = out;
  } catch (err) { r.error = 'AI: ' + err.message; }
  r.busy = false; draw();
}

async function saveReplyState(btn) {
  const p = currentProspect(); const res = state.reply.result;
  if (!p || !res) return;
  btn.disabled = true;
  const { error } = await supabase.from('interactions').insert({ org_id: ctx.org.id, prospect_id: p.id, kind: 'not', summary: state.reply.input.slice(0, 280) });
  if (error) { btn.disabled = false; toast(trError(error)); return; }
  if (res.takip_gun) {
    const { data } = await supabase.from('prospects').update({ next_follow_up_at: addDays(res.takip_gun).toISOString() }).eq('id', p.id).select().single();
    if (data) state.prospects = state.prospects.map(x => (x.id === p.id ? { ...x, ...data } : x));
  }
  toast(`Kaydedildi${res.takip_gun ? `, takip ${res.takip_gun} gün sonra` : ''}.`);
}

async function setReplyTemp() {
  const p = currentProspect(); const t = state.reply.result?.sicaklik;
  const { data, error } = await supabase.from('prospects').update({ temperature: t }).eq('id', p.id).select().single();
  if (error) { toast(trError(error)); return; }
  state.prospects = state.prospects.map(x => (x.id === p.id ? { ...x, ...data } : x));
  draw(); toast(`${firstName(p.full_name)}: ${TEMPS[t].label}`);
}

// ====================================================================
// Pratik: AI ile rol yapma
function viewPractice() {
  const key = state.ai;
  const p = state.practice;
  if (!p) {
    return `<p class="small muted">Bir senaryo seç. Karşındaki kişiyi AI canlandırır; ${MAX_TURNS} mesaj sonra (ya da istediğinde) sponsor gözüyle geri bildirim alırsın.</p>
      ${key ? '' : `<div class="card import-card"><i class="ti ti-key" aria-hidden="true"></i><div><strong>Pratik için AI gerekiyor</strong>
        <p class="small muted">Ayarlar → AI asistan bölümünden kurabilirsin. O zamana kadar senaryoları okuyup İtiraz rehberiyle çalışabilirsin.</p></div>
        <div class="import-actions"><a class="btn btn-gold" href="#/ayarlar">Ayarlara git</a></div></div>`}
      <div class="grid lib-grid">${SCENARIOS.map(sc => `<article class="card tpl-card">
        <header><h3><i class="ti ${sc.icon}" aria-hidden="true"></i> ${esc(sc.title)}</h3></header>
        <p class="small muted">${esc(sc.persona)}</p>
        <blockquote class="opener">"${esc(sc.opener)}"</blockquote>
        <footer><button class="btn ${key ? 'btn-primary' : 'btn-ghost'}" data-act="sc-start" data-id="${sc.id}" ${key ? '' : 'disabled'}>
          <i class="ti ti-player-play" aria-hidden="true"></i> Başla</button></footer></article>`).join('')}</div>`;
  }
  const sc = SCENARIOS.find(x => x.id === p.id);
  const turns = p.chat.filter(m => m.role === 'user').length;
  return `<section class="card chat-card">
    <header class="chat-head"><div><strong>${esc(sc.title)}</strong><span class="small muted"> · ${turns}/${MAX_TURNS} mesaj</span></div>
      <button class="btn btn-ghost sm" data-act="sc-reset">Senaryolar</button></header>
    <div class="chat" id="chat">
      <div class="msg them">${esc(sc.opener)}</div>
      ${p.chat.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'them'}">${esc(m.content)}</div>`).join('')}
      ${p.busy ? '<div class="msg them typing">yazıyor…</div>' : ''}
    </div>
    ${p.feedback ? `<div class="feedback">${esc(p.feedback).replace(/\n/g, '<br>')}</div>
      <div class="quick"><button class="btn btn-primary" data-act="sc-start" data-id="${sc.id}">Tekrar dene</button>
      <button class="btn btn-ghost" data-act="sc-reset">Başka senaryo</button></div>` : `
    <form data-form="chat" class="inline-form" novalidate>
      <input name="msg" placeholder="Cevabını yaz…" aria-label="Mesajın" maxlength="600" ${p.busy || turns >= MAX_TURNS ? 'disabled' : ''} autocomplete="off">
      <button class="btn btn-primary" type="submit" ${p.busy || turns >= MAX_TURNS ? 'disabled' : ''}>Gönder</button>
    </form>
    <div id="i-check"></div>
    <button class="btn btn-gold" data-act="sc-end" ${p.busy || !turns ? 'disabled' : ''} style="margin-top:10px">
      <i class="ti ti-clipboard-check" aria-hidden="true"></i> Bitir ve geri bildirim al</button>`}
    <p class="error" id="chat-err" role="alert">${esc(p.error || '')}</p>
  </section>`;
}

function startPractice(id) {
  state.practice = { id, chat: [], busy: false, feedback: '', error: '' };
  draw();
  el.querySelector('[name="msg"]')?.focus();
}

async function sendChat(form) {
  const p = state.practice;
  const input = form.elements.namedItem('msg');
  const text = input.value.trim();
  if (!text) { p.error = 'Bir şey yaz.'; draw(); return; }
  const sc = SCENARIOS.find(x => x.id === p.id);
  p.chat.push({ role: 'user', content: text }); p.busy = true; p.error = '';
  draw(); scrollChat();
  try {
    const reply = await aiChat({ system: systemPrompt(sc), messages: apiMessages(sc, p.chat), maxTokens: 200 });
    p.chat.push({ role: 'assistant', content: reply });
  } catch (err) {
    p.chat.pop(); p.error = 'AI hatası: ' + err.message;
  }
  p.busy = false;
  draw(); scrollChat();
  if (p.chat.filter(m => m.role === 'user').length >= MAX_TURNS) endPractice();
  else el.querySelector('[name="msg"]')?.focus();
}

async function endPractice() {
  const p = state.practice;
  if (!p || p.busy || !p.chat.length) return;
  const sc = SCENARIOS.find(x => x.id === p.id);
  p.busy = true; draw();
  try {
    p.feedback = await aiChat({
      messages: [{ role: 'user', content: feedbackPrompt(sc, [{ role: 'assistant', content: sc.opener }, ...p.chat]) }], maxTokens: 700 });
  } catch (err) { p.error = 'Geri bildirim alınamadı: ' + err.message; }
  p.busy = false; draw(); scrollChat();
}

function scrollChat() { const c = el.querySelector('#chat'); if (c) c.scrollTop = c.scrollHeight; }
