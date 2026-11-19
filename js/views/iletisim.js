// İletişim birimi: mesaj oluştur, şablon kütüphanesi, itiraz rehberi
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { PURPOSES, purposeLabel, SYSTEM_TEMPLATES, OBJECTIONS } from '../iletisim/content.js';
import { checkMessage, fillTemplate } from '../iletisim/uyum.js';
import { CHANNELS, waNumber, addDays, stageLabel } from '../kazanim/model.js';
import { SCENARIOS, MAX_TURNS, systemPrompt, feedbackPrompt, callClaude, apiMessages } from '../iletisim/pratik.js';

const TABS = [
  { id: 'yaz', label: 'Mesaj yaz', icon: 'ti-pencil' },
  { id: 'sablon', label: 'Şablonlar', icon: 'ti-template' },
  { id: 'itiraz', label: 'İtiraz rehberi', icon: 'ti-shield-question' },
  { id: 'pratik', label: 'Pratik', icon: 'ti-messages' }
];
export const AI_KEY = 'nmd_anthropic_key';
const LEGACY_AI_KEY = 'nma_api_key';
export const getApiKey = () => localStorage.getItem(AI_KEY) || localStorage.getItem(LEGACY_AI_KEY) || '';

let el, ctx;
let state = { tab: 'yaz', prospects: [], mine: [], purpose: '', prospectId: '', text: '', filterPurpose: '' };

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
    supabase.from('prospects').select('id, full_name, phone, stage, occupation, interests, notes, next_follow_up_at')
      .is('deleted_at', null).order('full_name').limit(2000),
    supabase.from('scripts').select('*').order('created_at', { ascending: false })
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  state.prospects = p.data;
  state.mine = s.data;
  draw();
}

// Sistem şablonları + kendi/ekip şablonları tek listede
function allTemplates() {
  const own = state.mine.map(t => ({ id: t.id, purpose: t.purpose, channel: t.channel, title: t.title, body: t.body,
    own: t.owner_id === ctx.user.id, shared: t.is_shared }));
  return [...own, ...SYSTEM_TEMPLATES];
}
const myName = () => (ctx.profile?.full_name || '').split(' ')[0];
const currentProspect = () => state.prospects.find(p => p.id === state.prospectId) || null;

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  const body = el.querySelector('#i-body');
  body.innerHTML = state.tab === 'yaz' ? viewCompose() : state.tab === 'sablon' ? viewLibrary() : state.tab === 'pratik' ? viewPractice() : viewObjections();
  if (state.tab === 'yaz') renderCheck();
}

// ====================================================================
// Mesaj yaz
function viewCompose() {
  const p = currentProspect();
  const list = allTemplates().filter(t => !state.purpose || t.purpose === state.purpose).slice(0, 12);
  const hasKey = !!getApiKey();
  return `
  <div class="compose">
    <section class="card">
      <h2><i class="ti ti-user" aria-hidden="true"></i> Kime?</h2>
      <div class="field" style="margin-bottom:6px">
        <label for="i-prospect">Aday seç</label>
        <select id="i-prospect">
          <option value="">Listeden seç (isteğe bağlı)</option>
          ${state.prospects.map(x => `<option value="${x.id}" ${x.id === state.prospectId ? 'selected' : ''}>${esc(x.full_name)} · ${esc(stageLabel(x.stage))}</option>`).join('')}
        </select>
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
          <span class="tpl-body">${esc(fillTemplate(t.body, { isim: p?.full_name.split(' ')[0], ben: myName() }))}</span>
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
      ${hasKey ? '' : `<p class="small muted" style="margin-top:10px">AI ile kişiselleştirme için <a href="#/ayarlar">Ayarlar</a>'dan Claude API anahtarını ekleyebilirsin.</p>`}
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
    case 'sc-end': endPractice(b); break;
    case 'sc-reset': state.practice = null; draw(); break;
  }
}

function onInput(e) {
  if (e.target.id === 'i-text') { state.text = e.target.value; renderCheck(); }
  if (e.target.id === 't-body') updateTplCheck();
}

function onChange(e) {
  if (e.target.id === 'i-prospect') {
    const prevName = currentProspect()?.full_name.split(' ')[0];
    state.prospectId = e.target.value;
    const p = currentProspect();
    // Metinde önceki adayın adı ya da [isim] geçiyorsa yenisiyle değiştir
    if (p) {
      const first = p.full_name.split(' ')[0];
      state.text = state.text.replace(/\[isim\]/g, first);
      if (prevName && prevName !== first) state.text = state.text.split(prevName).join(first);
    }
    draw();
  }
}

function useTemplate(body) {
  if (!body) return;
  const p = currentProspect();
  state.text = fillTemplate(body, { isim: p?.full_name.split(' ')[0], ben: myName() });
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
  const key = getApiKey();
  const p = currentProspect();
  const draft = state.text.trim();
  if (!key) { toast('Önce Ayarlar\'dan API anahtarını ekle.'); return; }
  if (!draft) { toast('Önce bir şablon seç ya da taslak yaz.'); return; }
  btn.disabled = true;
  const old = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Yazılıyor…';
  const info = p ? [`Ad: ${p.full_name}`, p.occupation && `Meslek: ${p.occupation}`, p.interests && `İlgi alanları: ${p.interests}`,
    p.notes && `Notlar: ${p.notes}`, `Aşama: ${stageLabel(p.stage)}`].filter(Boolean).join('\n') : 'Aday bilgisi yok.';
  const prompt = `Bir network marketing distribütörü için WhatsApp mesajını kişiselleştir.
Kurallar:
- Türkçe, samimi, kısa (en fazla 3 cümle).
- Sağlık iddiası YASAK (tedavi eder, iyileştirir, ağrıyı geçirir, hastalık adı vb.).
- Kazanç vaadi YASAK (rakam, garanti, kolay/pasif gelir, zengin ol vb.).
- Baskı ve acele ettirme YASAK.
- Amaç merak uyandırıp kısa bir görüşmeye davet etmek; ürün veya iş detayına girme.
- Sadece mesaj metnini yaz, açıklama ekleme.

Aday:
${info}

Taslak mesaj:
${draft}`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (!text) throw new Error('Boş yanıt geldi');
    state.text = text;
    draw();
    toast('AI önerisi hazır. Göndermeden önce oku ve düzenle.');
  } catch (err) {
    toast('AI hatası: ' + (err.message || err));
    btn.disabled = false; btn.innerHTML = old;
  }
}

// ====================================================================
// Pratik: AI ile rol yapma
function viewPractice() {
  const key = getApiKey();
  const p = state.practice;
  if (!p) {
    return `<p class="small muted">Bir senaryo seç. Karşındaki kişiyi AI canlandırır; ${MAX_TURNS} mesaj sonra (ya da istediğinde) sponsor gözüyle geri bildirim alırsın.</p>
      ${key ? '' : `<div class="card import-card"><i class="ti ti-key" aria-hidden="true"></i><div><strong>Pratik için Claude API anahtarı gerekiyor</strong>
        <p class="small muted">Ayarlar'dan ekleyebilirsin; anahtar yalnızca bu cihazda saklanır. Anahtar olmadan da senaryoları okuyup İtiraz rehberiyle çalışabilirsin.</p></div>
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
    const reply = await callClaude(getApiKey(), { system: systemPrompt(sc), messages: apiMessages(sc, p.chat), maxTokens: 200 });
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
    p.feedback = await callClaude(getApiKey(), {
      messages: [{ role: 'user', content: feedbackPrompt(sc, [{ role: 'assistant', content: sc.opener }, ...p.chat]) }], maxTokens: 700 });
  } catch (err) { p.error = 'Geri bildirim alınamadı: ' + err.message; }
  p.busy = false; draw(); scrollChat();
}

function scrollChat() { const c = el.querySelector('#chat'); if (c) c.scrollTop = c.scrollHeight; }
