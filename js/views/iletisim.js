// İletişim birimi: mesaj oluştur, şablon kütüphanesi, itiraz rehberi
import { supabase, fetchAll } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { PURPOSES, purposeLabel, SYSTEM_TEMPLATES, OBJECTIONS } from '../iletisim/content.js';
import { checkMessage, checkForScenario, autoFix, fillTemplate } from '../iletisim/uyum.js';
import { crmMessages, crmSync, crmAutoSync, crmStatus, resultText, transcript, lastIncoming, awaitingReply, recentWriters, messagesHTML } from '../crm/client.js';
import { SCENARIOS as MSG_SC, HITAP, SENDERS, STOP_FOLLOWUP, LIMITS, BRAND_RULES, buildReplyPrompt, rewritePrompt, isExcluded, isCold, windowState, last4, checkLimits, hitapRule } from '../iletisim/strateji.js';
import { CHANNELS, waNumber, addDays, stageLabel } from '../kazanim/model.js';
import { pickerHTML, bindPicker } from '../ui/picker.js';
import { SCENARIOS, MAX_TURNS, systemPrompt, feedbackPrompt, apiMessages } from '../iletisim/pratik.js';
import { aiChat, aiAvailable, extractJSON, ensureShareConsent, prospectBrief, getApiKey, AI_KEY } from '../ai/client.js';
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
let state = { tab: 'yaz', prospects: [], mine: [], purpose: '', prospectId: '', text: '', filterPurpose: '', ai: false, reply: { goal: 'auto', hitap: 'siz', sender: 'kisisel', warmOk: false, input: '', conv: null, result: null, approve: null, busy: false, error: '' } };

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

  const [, s] = await Promise.all([
    loadProspects(),
    supabase.from('scripts').select('*').order('created_at', { ascending: false })
  ]);
  if (s.error) throw s.error;
  state.mine = s.data;
  state.ai = await aiAvailable();
  // Başka sayfadan gönderilen taslak (Koç / Liste çalışması)
  try {
    const draft = JSON.parse(sessionStorage.getItem('nmd_draft') || 'null');
    if (draft) { sessionStorage.removeItem('nmd_draft'); state.tab = 'yaz'; state.text = draft.text || ''; if (draft.prospectId) state.prospectId = draft.prospectId; }
  } catch { /* yok */ }
  draw();
  if (state.tab === 'cevap') loadConv();
  // WhatsApp bot CRM: yeni yazanları arka planda getir (30 dakikada bir)
  crmAutoSync().then(async res => {
    if (res && (res.yeni || res.guncellenen) && el?.isConnected) {
      await loadProspects();
      if (res.yeni) toast(`WhatsApp: ${res.yeni} yeni kişi listeye eklendi.`);
      if (state.tab === 'cevap' && !state.reply.busy) { draw(); }
    }
  });
}

async function loadProspects() {
  const p = await fetchAll(() => supabase.from('prospects').select('id, full_name, phone, instagram, stage, temperature, tags, occupation, interests, notes, next_follow_up_at, last_contact_at, extra').is('deleted_at', null).order('full_name'));
  if (p.error) throw p.error;
  // Çalışma dışı gruplar ("!") iletişim kapsamı dışında
  state.prospects = p.data.filter(x => !isExcluded(x));
}

// Seçili kişinin WhatsApp (CRM) konuşmasını getir — yalnızca ekranda ve AI isteminde kullanılır, kaydedilmez
async function loadConv() {
  const p = currentProspect();
  const r = state.reply;
  if (!p || !p.extra?.crm?.id) { r.conv = null; return; }
  if (r.conv?.pid === p.id && r.conv.status !== 'error') return;
  r.conv = { pid: p.id, status: 'loading', msgs: [] };
  refreshRecipient();
  try {
    const msgs = await crmMessages(p.id, 40);
    if (state.prospectId !== p.id) return;
    r.conv = { pid: p.id, status: 'ok', msgs };
  } catch (err) {
    if (state.prospectId !== p.id) return;
    r.conv = { pid: p.id, status: 'error', msgs: [], error: err.message };
  }
  refreshRecipient();
}

function refreshRecipient() {
  const box = el?.querySelector('#r-recipient');
  if (box) box.innerHTML = recipientHTML(currentProspect(), state.reply);
  const lbl = el?.querySelector('label[for="r-input"]');
  if (lbl) lbl.textContent = convReady() ? 'Ek not (isteğe bağlı) — durumu ya da amacını yaz' : 'Kişinin son mesajını yapıştır ya da durumu anlat *';
}

const convReady = () => {
  const c = state.reply.conv;
  return !!(c && c.pid === state.prospectId && c.status === 'ok' && c.msgs.some(m => m.direction === 'gelen'));
};

function selectReplyProspect(id) {
  state.prospectId = id || ''; state.reply.warmOk = false; state.reply.conv = null;
  state.reply.result = null; state.reply.approve = null;
  draw(); loadConv();
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
  if (state.tab === 'cevap') bindPicker(el, { id: 'r-pick', prospects: state.prospects, onSelect: p => {
    state.prospectId = p ? p.id : ''; state.reply.warmOk = false; state.reply.conv = null;
    refreshRecipient(); loadConv();
  } });
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
  if (tab) { state.tab = tab.dataset.tab; history.replaceState(null, '', `#/iletisim?tab=${state.tab}`); draw(); if (state.tab === 'cevap') loadConv(); return; }
  const pur = t.closest('[data-purpose]');
  if (pur) { state.purpose = pur.dataset.purpose; draw(); return; }
  const fp = t.closest('[data-fpurpose]');
  if (fp) { state.filterPurpose = fp.dataset.fpurpose; draw(); return; }
  const use = t.closest('[data-use]');
  if (use) { useTemplate(allTemplates().find(x => String(x.id) === use.dataset.use)?.body); return; }
  const rp = t.closest('[data-rpick]');
  if (rp) { state.reply.approve = { text: state.reply.result.secenekler[+rp.dataset.rpick].mesaj, approved: false, status: '' }; draw(); return; }
  const rw = t.closest('[data-rw]');
  if (rw) { selectReplyProspect(rw.dataset.rw); return; }
  const aps = t.closest('[data-apstatus]');
  if (aps) { markStatus(aps.dataset.apstatus); return; }
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
    case 'crm-refresh': refreshFromCrm(b); break;
    case 'ap-copy': approve('copy'); break;
    case 'ap-wa': approve('wa'); break;
    case 'ap-back': state.reply.approve = null; draw(); break;
    case 'ap-new': state.reply.approve = null; state.reply.result = null; draw(); break;
    case 'hist-clear': localStorage.removeItem(histKey()); draw(); break;
    case 'r-temp': setReplyTemp(); break;
    case 'sc-end': endPractice(b); break;
    case 'sc-reset': state.practice = null; draw(); break;
  }
}

function onInput(e) {
  if (e.target.id === 'ap-text') { onApproveInput(e); return; }
  if (e.target.id === 'i-text') { state.text = e.target.value; renderCheck(); }
  if (e.target.id === 't-body') updateTplCheck();
}

function onChange(e) {
  if (e.target.name === 'sender' && state.tab === 'cevap') {
    state.reply.sender = e.target.value;
    const box = el.querySelector('#r-recipient'); if (box) box.innerHTML = recipientHTML(currentProspect(), state.reply);
  }
}

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
  const f = checkMessage(text);
  if (f.length) { toast(`Marka filtresi: ${f.map(x => x.cat).join(', ')}. Önce metni düzelt.`); return null; }
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
    org_id: ctx.org.id, prospect_id: p.id, kind: 'mesaj', channel: 'WhatsApp', summary: 'WhatsApp mesajı gönderildi'
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
    state.text = autoFix(await aiChat({ maxTokens: 600, messages: [{ role: 'user', content:
      `${myName() || 'Hakan'} için WhatsApp mesajını kişiselleştir.\n${BRAND_RULES}\nHİTAP VE KİMLİK: ${hitapRule('siz', 'kisisel', myName() || 'Hakan')} Taslakta "sen" kullanılmışsa "sen" kalsın.\nSadece mesaj metnini yaz, açıklama ekleme.\n\nKişi: ${p ? prospectBrief(p) : 'bilgi yok'}\n\nTaslak:\n${draft}` }] }));
    draw();
    toast('AI önerisi hazır. Göndermeden önce oku ve düzenle.');
  } catch (err) {
    toast('AI hatası: ' + (err.message || err));
    btn.disabled = false; btn.innerHTML = old;
  }
}

// ====================================================================
// Cevap öner — Mesaj Üretim Stratejisi'ne göre:
// kişi + senaryo seç → metin üret → marka filtresi → alıcı bilgisiyle onay → kopyala/WhatsApp → durum işaretle.
// Üretilen metinler kişi kartına yazılmaz; yalnızca bu cihazdaki kendi geçmişinde tutulur.
const INTENT = { ilgili: ['İlgili', 'ok'], kararsiz: ['Kararsız', 'gold'], itiraz: ['İtirazı var', 'warn'], ilgisiz: ['İlgisiz', ''], belirsiz: ['Belirsiz', ''] };
const HIST_MAX = 100;
const histKey = () => `nmd_msg_hist_${ctx.user.id}`;
const sendKey = () => `nmd_msg_send_${ctx.user.id}`;
const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function recipientHTML(p, r) {
  if (!p) return `<div class="hint-box"><i class="ti ti-info-circle" aria-hidden="true"></i><span>Kişi seçmezsen metin genel olarak üretilir; pencere ve sınır kontrolü yapılamaz.</span></div>`;
  const crm = p.extra?.crm;
  const c = r.conv?.pid === p.id ? r.conv : null;
  const liveIn = c?.status === 'ok' ? lastIncoming(c.msgs) : null;
  const w = liveIn ? windowState({ extra: { crm: { conv: { ...(crm?.conv || {}), last_in_at: liveIn } } } }) : windowState(p);
  const lastC = p.last_contact_at ? new Date(p.last_contact_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'kayıt yok';
  const win = !w.known ? '<span class="badge">Pencere: bot konuşması yok</span>'
    : w.open ? `<span class="badge ok">24 saat penceresi açık · ${w.hoursLeft ? w.hoursLeft + ' sa' : w.minutesLeft + ' dk'} kaldı</span>`
      : '<span class="badge warn">24 saat penceresi kapalı</span>';
  return `<div class="recipient">
    <div><strong>${esc(p.full_name)}</strong> ${last4(p.phone) ? `<span class="muted small">· ••${esc(last4(p.phone))}</span>` : ''}</div>
    <div class="chips">${crm?.protected ? '<span class="badge gold">Korunan kişi (rehber)</span>' : ''}${win}
      <span class="badge">Son temas: ${esc(lastC)}</span></div>
    ${w.known && !w.open && r.sender === 'asistan' ? `<p class="error small">Pencere kapalı: bot numarasından yalnızca onaylı şablon gönderilebilir, serbest metin üretilmez.
      Kendi telefonundan yazacaksan "Gönderen"i değiştir.</p>` : ''}
    ${convBoxHTML(c, crm)}
    ${isCold(p) ? `<label class="check small"><input type="checkbox" name="warm" ${r.warmOk ? 'checked' : ''}>
      <span>Bu kişiyle daha önce yazışma kaydı yok. Soğuk kişiye metin önerilmez; önce ilk temas yolunu netleştir. <strong>Daha önce yazıştık</strong> ise işaretle.</span></label>` : ''}
  </div>`;
}

function convBoxHTML(c, crm) {
  if (!crm?.id) return '<p class="small muted"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Bu kişinin WhatsApp bot konuşması yok; son mesajı aşağıya yapıştır.</p>';
  if (!c || c.status === 'loading') return '<p class="small muted"><i class="ti ti-loader-2" aria-hidden="true"></i> WhatsApp konuşması yükleniyor…</p>';
  if (c.status === 'error') return `<p class="small error">WhatsApp konuşması alınamadı: ${esc(c.error)}. Son mesajı aşağıya yapıştırabilirsin.</p>`;
  if (!c.msgs.length) return '<p class="small muted">WhatsApp konuşmasında mesaj yok.</p>';
  const waiting = awaitingReply(c.msgs);
  return `<div class="conv-box">
    <p class="small"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> <strong>${c.msgs.length} mesaj yüklendi</strong>
      ${waiting ? '<span class="badge gold">Son mesaj kişiden — cevap bekliyor</span>' : '<span class="badge">Son mesaj senden/bottan</span>'}</p>
    <p class="small muted">AI bu yazışmayı okuyup son mesaja cevap önerecek. Mesajlar kaydedilmez.</p>
    <details><summary class="small">Son mesajları göster</summary><div class="crm-msgs">${messagesHTML(c.msgs.slice(-8))}</div></details>
  </div>`;
}

function recentHTML() {
  const list = recentWriters(state.prospects, 6);
  return `<div class="recent-writers">
    <div class="rw-head"><span class="small muted">Son yazanlar</span>
      <button type="button" class="btn btn-ghost sm" data-act="crm-refresh"><i class="ti ti-refresh" aria-hidden="true"></i> Yeni yazanları getir</button></div>
    ${list.length ? `<div class="chips">${list.map(p => {
      const cv = p.extra.crm.conv;
      const wait = cv.handoff_status === 'bekliyor' || cv.unread_count > 0;
      return `<button type="button" class="chip ${state.prospectId === p.id ? 'on' : ''}" data-rw="${esc(p.id)}">${wait ? '<span class="dot" aria-label="cevap bekliyor"></span>' : ''}${esc(p.full_name)}</button>`;
    }).join('')}</div>` : '<p class="small muted">WhatsApp bot\'tan gelen konuşma yok.</p>'}
  </div>`;
}

async function refreshFromCrm(btn) {
  const st = await crmStatus();
  if (!st.linked) { toast('WhatsApp bot CRM bağlı değil.'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Getiriliyor…';
  try {
    const res = await crmSync();
    await loadProspects();
    state.reply.conv = null;
    toast(`WhatsApp: ${resultText(res)}`);
    draw(); loadConv();
  } catch (err) {
    toast(`Getirilemedi: ${err.message}`);
    btn.disabled = false; btn.textContent = 'Tekrar dene';
  }
}

function viewReply() {
  const r = state.reply;
  if (!state.ai) return `<div class="card empty"><i class="ti ti-sparkles" aria-hidden="true"></i><h2>AI henüz kurulmadı</h2>
    <p class="muted">Cevap önerisi için AI gerekiyor. Ayarlar → AI asistan bölümünden kurabilirsin.</p><a class="btn btn-gold" href="#/ayarlar">Ayarlara git</a></div>`;
  const res = r.result;
  const cp = currentProspect();
  const hist = readLS(histKey()).slice(0, 15);
  return `<div class="compose">
    <form class="card" data-form="reply" novalidate>
      <h2><i class="ti ti-message-question" aria-hidden="true"></i> Ne oldu?</h2>
      ${recentHTML()}
      <div class="field">${pickerHTML({ id: 'r-pick', label: 'Kiminle yazışıyorsun?', prospects: state.prospects, selectedId: state.prospectId })}</div>
      <div id="r-recipient">${recipientHTML(cp, r)}</div>
      <div class="field"><label for="r-input">${convReady() ? 'Ek not (isteğe bağlı) — durumu ya da amacını yaz' : 'Kişinin son mesajını yapıştır ya da durumu anlat *'}</label>
        <textarea id="r-input" name="input" rows="5" maxlength="3000" placeholder="Ör. Ürün almak istiyordu, 3 gün süre istedi; şimdi mesajlara dönmüyor.">${esc(r.input)}</textarea>
        <p class="small muted">Sağlık, borç, maddi durum ve aile konuları yalnızca bu metni yazmak için kullanılır, hiçbir yere kaydedilmez.</p></div>
      <fieldset class="field"><legend>Durum</legend><div class="chips">
        ${Object.entries(MSG_SC).map(([k, v]) => `<label class="chip"><input type="radio" name="goal" value="${k}" ${r.goal === k ? 'checked' : ''}>${v.label}</label>`).join('')}</div></fieldset>
      <div class="grid-2">
        <fieldset class="field"><legend>Hitap</legend><div class="chips">
          ${Object.entries(HITAP).map(([k, l]) => `<label class="chip"><input type="radio" name="hitap" value="${k}" ${r.hitap === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
          <p class="small muted">Yeni kişiye "siz". Emin değilsen "siz".</p></fieldset>
        <fieldset class="field"><legend>Gönderen</legend><div class="chips">
          ${Object.entries(SENDERS).map(([k, l]) => `<label class="chip"><input type="radio" name="sender" value="${k}" ${r.sender === k ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>
      </div>
      <p class="error" id="r-error" role="alert">${esc(r.error)}</p>
      <button class="btn btn-primary" type="submit" ${r.busy ? 'disabled' : ''}><i class="ti ti-sparkles" aria-hidden="true"></i> ${r.busy ? 'Yazıyor…' : 'Metin öner'}</button>
    </form>
    <section class="card">
      ${res ? resultHTML(res, cp) : `<div class="empty"><i class="ti ti-bulb" aria-hidden="true"></i><h2>Nasıl çalışır?</h2>
        <p class="muted">Kişiyi ve durumu seç; AI senaryoya uygun metni yazar, marka filtresinden geçirir.
        Sen okur, düzenler, onaylarsın. Gönderimi her zaman sen yaparsın.</p></div>`}
      ${hist.length ? `<details class="hist"><summary class="small">Geçmişim (bu cihaz, son ${hist.length})</summary>
        <ol>${hist.map(h => `<li><span class="muted small">${esc(new Date(h.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(h.name || 'Genel')} · ${esc(MSG_SC[h.sc]?.label || '')}${h.status ? ' · ' + esc(STATUS[h.status]) : ''}</span><br>${esc(h.text)}</li>`).join('')}</ol>
        <button class="btn btn-ghost sm" type="button" data-act="hist-clear">Geçmişi temizle</button></details>` : ''}
    </section></div>`;
}

const STATUS = { gonderildi: 'Gönderildi', cevap: 'Cevap geldi', vazgecti: 'Vazgeçti' };

function resultHTML(res, cp) {
  const r = state.reply;
  const ap = r.approve;
  return `
    <h2><i class="ti ti-eye" aria-hidden="true"></i> Durum okuması</h2>
    <p><span class="badge">${esc(MSG_SC[res.senaryo]?.label || MSG_SC[r.goal]?.label || '')}</span>
      ${INTENT[res.niyet] ? `<span class="badge ${INTENT[res.niyet][1]}">${INTENT[res.niyet][0]}</span> ` : ''}${TEMPS[res.sicaklik] ? `<span class="badge ${TEMPS[res.sicaklik].cls}">${TEMPS[res.sicaklik].label}</span>` : ''}</p>
    <p>${esc(res.analiz)}</p>
    ${res.dropped ? `<p class="small muted">${res.dropped} öneri marka filtresine takıldığı için gösterilmedi.</p>` : ''}
    ${ap ? approveHTML(cp, ap) : `
    <h3>Önerilen metin${res.secenekler.length > 1 ? 'ler' : ''}</h3>
    ${res.secenekler.map((o, i) => `<article class="reply-opt">
        <header><strong>${esc(o.baslik || 'Seçenek ' + (i + 1))}</strong><span class="badge ok">Marka filtresi ✓</span></header>
        <p>${esc(o.mesaj)}</p>
        <button class="btn btn-primary sm" data-rpick="${i}"><i class="ti ti-checks" aria-hidden="true"></i> Bunu seç, oku ve onayla</button></article>`).join('')}`}
    ${res.sonraki_adim ? `<div class="hint-box"><i class="ti ti-arrow-right-circle" aria-hidden="true"></i><span><strong>Sonraki adım:</strong> ${esc(res.sonraki_adim)}
      ${res.takip_gun ? ` · Takip: ${res.takip_gun} gün sonra` : ''}</span></div>` : ''}
    ${cp && TEMPS[res.sicaklik] && res.sicaklik !== cp.temperature ? `<div class="quick" style="margin-top:12px"><button class="btn btn-ghost" data-act="r-temp">Sıcaklığı "${TEMPS[res.sicaklik].label}" yap</button></div>` : ''}`;
}

function approveHTML(cp, ap) {
  const f = checkForScenario(ap.text, state.reply.result.senaryo || state.reply.goal);
  const lim = checkLimits(readLS(sendKey()), cp?.id);
  const blocked = f.length || (!ap.approved && !lim.ok);
  return `<div class="approve card-inset">
    <h3><i class="ti ti-user-check" aria-hidden="true"></i> Onay</h3>
    ${cp ? `<p class="small"><strong>Alıcı:</strong> ${esc(cp.full_name)}${last4(cp.phone) ? ' · ••' + esc(last4(cp.phone)) : ''}${cp.extra?.crm?.protected ? ' · <span class="badge gold">Korunan</span>' : ''}</p>` : '<p class="small muted">Alıcı seçilmedi: yalnızca kopyalayabilirsin.</p>'}
    <div class="field"><label for="ap-text">Metni oku, gerekirse düzenle</label>
      <textarea id="ap-text" rows="5" ${ap.approved ? 'readonly' : ''}>${esc(ap.text)}</textarea></div>
    <div id="ap-check">${checkListHTML(f)}</div>
    ${!ap.approved ? `
      ${!lim.ok ? `<p class="error small">${esc(lim.reason)}</p>` : `<p class="small muted">Bugün kalan onay hakkın: ${lim.remaining}/${LIMITS.daily}</p>`}
      <div class="quick">
        <button class="btn btn-primary" data-act="ap-copy" ${blocked ? 'disabled' : ''}><i class="ti ti-copy" aria-hidden="true"></i> Onayla ve kopyala</button>
        ${cp && waNumber(cp.phone) ? `<button class="btn btn-gold" data-act="ap-wa" ${blocked ? 'disabled' : ''}><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Onayla, WhatsApp'ta aç</button>` : ''}
        <button class="btn btn-ghost" data-act="ap-back">Geri</button>
      </div>
      <p class="small muted">Otomatik gönderim yok. WhatsApp açıldığında mesajı sen gönderirsin.</p>`
    : `<p class="small"><span class="badge ok">Onaylandı</span> Gönderdikten sonra durumu işaretle:</p>
      <div class="quick">${Object.entries(STATUS).map(([k, l]) => `<button class="btn ${ap.status === k ? 'btn-primary' : 'btn-ghost'}" data-apstatus="${k}" ${ap.status || !cp ? 'disabled' : ''}>${l}</button>`).join('')}
        <button class="btn btn-ghost" data-act="ap-new">Yeni metin</button></div>
      ${ap.status ? `<p class="small muted">${esc(STATUS[ap.status])} olarak işaretlendi.</p>` : ''}`}
  </div>`;
}

function checkListHTML(f) {
  return f.length
    ? `<div class="uyum warn">${f.map(x => `<p class="small"><strong>${esc(x.cat)}:</strong> “${esc(x.hits.join('”, “'))}” — ${esc(x.tip)}</p>`).join('')}
       <p class="small"><strong>Bu haliyle onaylanamaz.</strong> Metni düzelt.</p></div>`
    : '<p class="small"><span class="badge ok">Marka filtresi ✓</span> Yasak ifade yok.</p>';
}

function onApproveInput(e) {
  if (e.target.id !== 'ap-text' || !state.reply.approve) return;
  state.reply.approve.text = e.target.value;
  const f = checkForScenario(e.target.value, state.reply.result.senaryo || state.reply.goal);
  const lim = checkLimits(readLS(sendKey()), currentProspect()?.id);
  el.querySelector('#ap-check').innerHTML = checkListHTML(f);
  el.querySelectorAll('[data-act="ap-copy"], [data-act="ap-wa"]').forEach(b => { b.disabled = !!f.length || !lim.ok; });
}

async function approve(mode) {
  const r = state.reply; const ap = r.approve; const p = currentProspect();
  const text = ap.text.trim();
  if (!text || checkForScenario(text, r.result.senaryo || r.goal).length) return;
  const lim = checkLimits(readLS(sendKey()), p?.id);
  if (!lim.ok) { toast(lim.reason); return; }
  if (mode === 'wa') {
    const n = waNumber(p?.phone); if (!n) return;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  } else {
    try { await navigator.clipboard.writeText(text); } catch { /* bazı tarayıcılar izin vermez */ }
    toast('Kopyalandı. Gönderdikten sonra durumu işaretle.');
  }
  const now = Date.now();
  writeLS(sendKey(), [{ at: now, pid: p?.id || null }, ...readLS(sendKey())].filter(x => now - x.at < 2 * 864e5).slice(0, 200));
  ap.histAt = now;
  writeLS(histKey(), [{ at: now, name: p ? p.full_name : '', sc: r.result.senaryo || r.goal, text }, ...readLS(histKey())].slice(0, HIST_MAX));
  ap.approved = true;
  draw();
}

async function markStatus(status) {
  const r = state.reply; const ap = r.approve; const p = currentProspect();
  if (!p || ap.status) return;
  const summary = { gonderildi: 'WhatsApp mesajı gönderildi', cevap: 'Cevap geldi', vazgecti: 'Vazgeçti, takip durduruldu' }[status];
  const { error } = await supabase.from('interactions').insert({ org_id: ctx.org.id, prospect_id: p.id, kind: 'mesaj', channel: 'WhatsApp', summary });
  if (error) { toast(trError(error)); return; }
  const patch = {};
  if (status === 'vazgecti') { patch.stage = 'pasif'; patch.next_follow_up_at = null; }
  else if (status === 'gonderildi') {
    const sc = r.result.senaryo || r.goal;
    if (STOP_FOLLOWUP.includes(sc)) patch.next_follow_up_at = null;
    else if (r.result.takip_gun) patch.next_follow_up_at = addDays(r.result.takip_gun).toISOString();
    if (p.stage === 'liste') patch.stage = 'temas';
  }
  if (Object.keys(patch).length) {
    const { data } = await supabase.from('prospects').update(patch).eq('id', p.id).select().single();
    if (data) state.prospects = state.prospects.map(x => (x.id === p.id ? { ...x, ...data } : x));
  }
  ap.status = status;
  writeLS(histKey(), readLS(histKey()).map(h => (h.at === ap.histAt ? { ...h, status } : h)));
  toast(status === 'vazgecti' ? 'Takip durduruldu, kişi "Pasif" aşamasına alındı.'
    : status === 'gonderildi' && patch.next_follow_up_at ? `Kaydedildi, takip ${r.result.takip_gun} gün sonra.` : 'Kaydedildi.');
  draw();
}

async function suggestReply(form) {
  const r = state.reply;
  r.input = form.elements.namedItem('input').value.trim();
  r.goal = form.querySelector('[name="goal"]:checked')?.value || 'auto';
  r.hitap = form.querySelector('[name="hitap"]:checked')?.value || 'siz';
  r.sender = form.querySelector('[name="sender"]:checked')?.value || 'kisisel';
  r.warmOk = !!form.querySelector('[name="warm"]')?.checked;
  const p = currentProspect();
  const fail = msg => { r.error = msg; draw(); };
  const conv = convReady() ? transcript(r.conv.msgs, 20) : '';
  if (!conv && r.input.length < 10) return fail('Durumu biraz daha ayrıntılı anlat (en az bir cümle) ya da WhatsApp konuşması olan bir kişi seç.');
  if (p && isExcluded(p)) return fail('Bu kişi çalışma dışı grupta ("!"). Metin üretilmez.');
  if (p && isCold(p) && !r.warmOk) return fail('Daha önce yazışılmamış kişiye metin önerilmez. Önce ilk temas yolunu netleştir.');
  const liveIn = conv ? lastIncoming(r.conv.msgs) : null;
  const w = p ? (liveIn ? windowState({ extra: { crm: { conv: { last_in_at: liveIn } } } }) : windowState(p)) : { known: false };
  if (w.known && !w.open && r.sender === 'asistan') return fail('24 saat penceresi kapalı: bot numarasından serbest metin gönderilemez, yalnızca onaylı şablon.');
  if (p && !ensureShareConsent()) return;
  r.error = ''; r.busy = true; r.result = null; r.approve = null; draw();
  let history = '';
  if (p) {
    const { data } = await supabase.from('interactions').select('kind, summary, occurred_at').eq('prospect_id', p.id)
      .order('occurred_at', { ascending: false }).limit(5);
    history = (data || []).filter(x => x.summary).map(x => `- ${new Date(x.occurred_at).toLocaleDateString('tr-TR')} ${x.kind}: ${String(x.summary).slice(0, 160)}`).join('\n');
  }
  const owner = myName() || 'Hakan';
  try {
    const prompt = buildReplyPrompt({ scenario: r.goal, input: r.input, brief: p ? prospectBrief(p) : '', history, conversation: conv, hitap: r.hitap, sender: r.sender, ownerName: owner });
    let out;
    try {
      out = extractJSON(await aiChat({ maxTokens: 1800, messages: [{ role: 'user', content: prompt }] }));
    } catch (e) {
      if (!/yarım|anlaşılamadı/.test(e.message)) throw e;
      out = extractJSON(await aiChat({ maxTokens: 1800, messages: [{ role: 'user', content:
        prompt + '\n\nÖNEMLİ: Çok kısa yaz. Analiz 1 cümle, her mesaj en fazla 2 cümle. Yalnızca geçerli JSON.' }] }));
    }
    if (!Array.isArray(out.secenekler) || !out.secenekler.length) throw new Error('Öneri gelmedi, tekrar dene.');
    const sc = MSG_SC[out.senaryo] && r.goal === 'auto' ? out.senaryo : r.goal;
    out.senaryo = sc === 'auto' ? (out.niyet === 'ilgisiz' ? 'vazgecti' : 'auto') : sc;
    let opts = out.secenekler.slice(0, (MSG_SC[r.goal] || MSG_SC.auto).count)
      .map(o => ({ baslik: String(o.baslik || ''), mesaj: autoFix(String(o.mesaj || '')) }));
    // Marka filtresi: takılanları bir kez yeniden yazdır, yine takılırsa gösterme
    const bad = opts.map((o, i) => ({ i, f: checkForScenario(o.mesaj, out.senaryo) })).filter(x => x.f.length);
    if (bad.length) {
      try {
        const fx = extractJSON(await aiChat({ maxTokens: 900, messages: [{ role: 'user', content:
          rewritePrompt(bad.map(b => ({ mesaj: opts[b.i].mesaj, issues: b.f.map(x => `${x.cat} (${x.hits.join(', ')})`).join('; ') })), out.senaryo, r.hitap, r.sender, owner) }] }));
        (fx.mesajlar || []).forEach((m, k) => { if (bad[k]) opts[bad[k].i].mesaj = autoFix(String(m || '')); });
      } catch { /* yeniden yazım olmadıysa aşağıda elenir */ }
    }
    const before = opts.length;
    opts = opts.filter(o => o.mesaj.trim() && !checkForScenario(o.mesaj, out.senaryo).length);
    if (!opts.length) throw new Error('Üretilen metinler marka filtresinden geçemedi. Durumu biraz farklı anlatıp tekrar dene.');
    out.dropped = before - opts.length;
    out.secenekler = opts;
    out.takip_gun = STOP_FOLLOWUP.includes(out.senaryo) ? 0 : Math.max(0, Math.min(14, Math.round(+out.takip_gun || 0)));
    r.result = out;
  } catch (err) { r.error = 'AI: ' + err.message; }
  r.busy = false; draw();
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
