// Koç: Sponsor Claude sohbeti ve birlikte liste çalışması
import { supabase, fetchAll } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { aiChat, aiAvailable, extractJSON, ensureShareConsent, prospectBrief, firstName } from '../ai/client.js';
import { COACH_SYSTEM, QUICK_PROMPTS, coachContext, coachMessages, LIST_FILTERS, pickBatch, listPrompt, normalizeSuggestions, FOLLOW_DAYS } from '../ai/coach.js';
import { TEMPS, stageLabel, dueFollowUps, quietHotProspects, countByStage, addDays } from '../kazanim/model.js';
import { dailyMetrics, sumRange, keysBetween, weekStart, monthStart, dayKey, activeStreak } from '../olcum/metrics.js';
import { LESSONS, FIRST_14 } from '../akademi/content.js';

const TABS = [
  { id: 'sohbet', label: 'Sponsor Claude', icon: 'ti-message-chatbot' },
  { id: 'liste', label: 'Liste çalışması', icon: 'ti-list-search' }
];
const PRIORITY = { 1: ['Bugün ulaş', 'warn'], 2: ['Bu hafta', 'gold'], 3: ['Bekleyebilir', ''] };
let el, ctx, s;

const chatKey = () => `nmd_coach_${ctx.user.id}`;

export async function renderKoc(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  let chat = [];
  try { chat = JSON.parse(localStorage.getItem(chatKey()) || '[]'); } catch { /* boş */ }
  s = { tab: TABS.some(t => t.id === tab) ? tab : 'sohbet', chat, busy: false, error: '',
    filter: 'untouched', batch: [], sugg: {}, notes: {}, skip: new Set(JSON.parse(sessionStorage.getItem('nmd_list_skip') || '[]')), listBusy: false };

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">AI asistan</div><h1>Koç</h1>
        <p class="muted">Sponsor Claude sayılarını görür; dürüst, gerçekçi ve etik bir koç gibi yol gösterir.</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="Koç sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}"><i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="c-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>`;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', e => { if (e.target.dataset.note) s.notes[e.target.dataset.note] = e.target.value; });

  s.ai = await aiAvailable();
  await loadData();
  if (!s.batch.length) s.batch = pickBatch(s.prospects, s.filter, s.skip);
  draw();
}

async function loadData() {
  const since = d => new Date(Date.now() - d * 864e5).toISOString();
  const [p, i, e, t, r, inc, team, ac, ap] = await Promise.all([
    fetchAll(() => supabase.from('prospects').select('id, full_name, stage, temperature, tags, occupation, interests, notes, last_contact_at, next_follow_up_at, created_at, deleted_at')
      .is('deleted_at', null)),
    fetchAll(() => supabase.from('interactions').select('prospect_id, kind, occurred_at').gte('occurred_at', since(60))),
    fetchAll(() => supabase.from('stage_events').select('prospect_id, from_stage, to_stage, occurred_at').gte('occurred_at', since(60))),
    supabase.from('kpi_targets').select('*').eq('org_id', ctx.org.id).maybeSingle(),
    supabase.from('weekly_reviews').select('score, actions, week_start').order('week_start', { ascending: false }).limit(1),
    supabase.from('income_entries').select('amount').eq('month', dayKey(monthStart())),
    supabase.rpc('team_overview', { p_org: ctx.org.id }),
    supabase.from('academy_progress').select('item_id'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('starts_at', new Date().toISOString()).eq('status', 'planli')
  ]);
  if (p.error) throw p.error;
  s.prospects = p.data;
  const days = dailyMetrics({ interactions: i.data || [], stageEvents: e.data || [] });
  const done = new Set((ac.data || []).map(x => x.item_id));
  s.data = {
    today: days[dayKey(new Date())] || { yeniTemas: 0, takip: 0 },
    week: sumRange(days, keysBetween(weekStart())),
    streak: activeStreak(days),
    targets: { daily_contacts: 5, daily_followups: 5, weekly_invites: 10, weekly_presentations: 3, monthly_income: 50000, ...(t.data || {}) },
    total: p.data.length,
    stages: Object.fromEntries(Object.entries(countByStage(p.data)).map(([k, v]) => [stageLabel(k), v])),
    due: dueFollowUps(p.data).length, quiet: quietHotProspects(p.data).length,
    untouched: p.data.filter(x => !x.last_contact_at && ['liste', 'temas'].includes(x.stage)).length,
    income: (inc.data || []).reduce((n, x) => n + Number(x.amount), 0),
    teamSize: (team.data || []).length, teamActive: (team.data || []).filter(m => m.status === 'active').length,
    lessons: LESSONS.filter(l => done.has(l.id)).length, tasks: FIRST_14.filter(x => done.has(x.id)).length,
    lastReview: r.data?.[0] || null, upcoming: ap.count || 0
  };
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  const body = el.querySelector('#c-body');
  if (!s.ai) {
    body.innerHTML = `<div class="card empty"><i class="ti ti-sparkles" aria-hidden="true"></i><h2>AI henüz kurulmadı</h2>
      <p class="muted">Koç ve liste çalışması için AI gerekiyor. Ayarlar → AI asistan bölümünden kurabilirsin.</p>
      <a class="btn btn-gold" href="#/ayarlar">Ayarlara git</a></div>`;
    return;
  }
  body.innerHTML = s.tab === 'sohbet' ? viewChat() : viewList();
  if (s.tab === 'sohbet') { const c = el.querySelector('#coach-chat'); if (c) c.scrollTop = c.scrollHeight; }
}

// ====================================================================
// Sohbet
function viewChat() {
  return `<section class="card chat-card">
    <header class="chat-head"><div><strong>Sponsor Claude</strong><span class="small muted"> · sayıların: bugün ${s.data.today.yeniTemas} temas, bu hafta ${s.data.week.davet} davet</span></div>
      ${s.chat.length ? '<button class="btn btn-ghost sm" data-act="clear">Yeni sohbet</button>' : ''}</header>
    <div class="chat coach" id="coach-chat">
      ${s.chat.length ? '' : `<div class="msg them">Merhaba ${esc(firstName(ctx.profile?.full_name) || '')}! Ben Sponsor Claude. Sayılarını görüyorum; nereden başlayalım?</div>`}
      ${s.chat.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'them'}">${esc(m.content)}</div>`).join('')}
      ${s.busy ? '<div class="msg them typing">düşünüyor…</div>' : ''}
    </div>
    <div class="chips quick-prompts">${QUICK_PROMPTS.map(q => `<button class="chip" data-quick="${q.id}" ${s.busy ? 'disabled' : ''}>${esc(q.label)}</button>`).join('')}
      <button class="chip" data-tab="liste"><i class="ti ti-list-search" aria-hidden="true"></i> Liste çalışması yapalım</button></div>
    <form data-form="coach" class="inline-form" novalidate>
      <input name="msg" placeholder="Sponsor Claude'a yaz…" aria-label="Mesajın" maxlength="1500" autocomplete="off" ${s.busy ? 'disabled' : ''}>
      <button class="btn btn-primary" type="submit" ${s.busy ? 'disabled' : ''}>Gönder</button>
    </form>
    <p class="error" role="alert">${esc(s.error)}</p>
    <p class="small muted"><i class="ti ti-lock" aria-hidden="true"></i> Koç yalnızca toplu sayılarını görür; aday adları gönderilmez.</p>
  </section>`;
}

async function sendCoach(text) {
  if (!text.trim() || s.busy) return;
  s.chat.push({ role: 'user', content: text.trim() });
  s.busy = true; s.error = ''; draw();
  try {
    const reply = await aiChat({ system: COACH_SYSTEM, messages: coachMessages(coachContext(s.data), s.chat), maxTokens: 700 });
    s.chat.push({ role: 'assistant', content: reply });
  } catch (err) { s.chat.pop(); s.error = 'AI: ' + err.message; }
  s.busy = false;
  localStorage.setItem(chatKey(), JSON.stringify(s.chat.slice(-30)));
  draw();
  el.querySelector('[name="msg"]')?.focus();
}

// ====================================================================
// Liste çalışması
function viewList() {
  const hasSugg = s.batch.some(p => s.sugg[p.id]);
  return `
    <div class="chips" role="group" aria-label="Hangi adaylar?" style="margin-bottom:12px">
      ${Object.entries(LIST_FILTERS).map(([k, f]) => `<button class="chip" data-filter="${k}" aria-pressed="${s.filter === k}">${esc(f.label)}</button>`).join('')}
    </div>
    <div class="card list-intro">
      <p><strong>Birlikte çalışalım:</strong> ${s.batch.length} aday seçtim. Tanıdığın kişiler için kutuya kısa bir not yaz
        (ör. "lise arkadaşım, spora meraklı, yeni anne oldu"), sonra AI her biri için öncelik, sıcaklık ve ilk mesaj önersin.</p>
      <div class="quick">
        <button class="btn btn-gold" data-act="evaluate" ${s.listBusy || !s.batch.length ? 'disabled' : ''}><i class="ti ti-sparkles" aria-hidden="true"></i>
          ${s.listBusy ? 'Değerlendiriyor…' : hasSugg ? 'Notlarla yeniden değerlendir' : 'AI ile değerlendir'}</button>
        <button class="btn btn-ghost" data-act="next" ${s.listBusy ? 'disabled' : ''}>Sonraki 10 aday</button>
      </div>
      <p class="error" role="alert">${esc(s.error)}</p>
    </div>
    <div class="list-cards">
      ${s.batch.map(p => listCard(p)).join('') || '<div class="card empty"><p class="muted">Bu filtrede çalışılacak aday kalmadı. Başka bir filtre seç.</p></div>'}
    </div>`;
}

function listCard(p) {
  const t = TEMPS[p.temperature] || TEMPS.ilik;
  const g = s.sugg[p.id];
  const [plabel, pcls] = g ? PRIORITY[g.oncelik] : ['', ''];
  return `<article class="card list-card ${g ? 'p' + g.oncelik : ''}">
    <header><div><h3>${esc(p.full_name)}</h3>
      <span class="badge ${t.cls}">${t.label}</span> <span class="badge">${esc(stageLabel(p.stage))}</span>
      ${(p.tags || []).map(x => `<span class="badge gold">${esc(x)}</span>`).join(' ')}
      <span class="small muted">${p.last_contact_at ? 'son temas ' + new Date(p.last_contact_at).toLocaleDateString('tr-TR') : 'hiç temas yok'}</span></div>
      ${g ? `<span class="badge ${pcls}">${plabel}</span>` : ''}</header>
    ${p.notes ? `<p class="small muted">${esc(String(p.notes).slice(0, 160))}</p>` : ''}
    <input class="list-note" data-note="${p.id}" value="${esc(s.notes[p.id] || '')}" placeholder="Bu kişi hakkında bildiklerin (isteğe bağlı)" maxlength="300" aria-label="${esc(p.full_name)} hakkında not">
    ${g ? `<div class="sugg">
      ${g.neden ? `<p><strong>Neden:</strong> ${esc(g.neden)}</p>` : ''}
      ${g.ilk_adim ? `<p><strong>İlk adım:</strong> ${esc(g.ilk_adim)}</p>` : ''}
      ${g.sicaklik && g.sicaklik !== p.temperature ? `<p class="small">Önerilen sıcaklık: <span class="badge ${TEMPS[g.sicaklik].cls}">${TEMPS[g.sicaklik].label}</span></p>` : ''}
      ${g.mesaj ? `<blockquote>${esc(g.mesaj)}</blockquote>` : ''}
    </div>` : ''}
    <footer class="quick">
      ${g ? `<button class="btn btn-primary sm" data-apply="${p.id}"><i class="ti ti-check" aria-hidden="true"></i> Uygula (takip ${FOLLOW_DAYS[g.oncelik] === 0 ? 'bugün' : FOLLOW_DAYS[g.oncelik] + ' gün sonra'})</button>
        <button class="btn btn-ghost sm" data-write="${p.id}"><i class="ti ti-message-2" aria-hidden="true"></i> Mesaj yaz</button>` : ''}
      <button class="btn btn-ghost sm" data-skip="${p.id}">Atla</button>
    </footer>
  </article>`;
}

async function evaluate() {
  if (!s.batch.length || s.listBusy) return;
  if (!ensureShareConsent()) return;
  s.listBusy = true; s.error = ''; draw();
  try {
    const briefs = s.batch.map(p => prospectBrief(p));
    const out = normalizeSuggestions(extractJSON(await aiChat({ maxTokens: 2500,
      messages: [{ role: 'user', content: listPrompt(s.batch, briefs, s.notes) }] })), s.batch.length);
    if (!out.length) throw new Error('Öneri gelmedi, tekrar dene.');
    out.forEach(x => { s.sugg[s.batch[x.i].id] = x; });
    // Önceliğe göre sırala
    s.batch.sort((a, b) => (s.sugg[a.id]?.oncelik || 9) - (s.sugg[b.id]?.oncelik || 9));
  } catch (err) { s.error = 'AI: ' + err.message; }
  s.listBusy = false; draw();
}

function nextBatch() {
  s.batch.forEach(p => s.skip.add(p.id));
  sessionStorage.setItem('nmd_list_skip', JSON.stringify([...s.skip].slice(-3000)));
  s.batch = pickBatch(s.prospects, s.filter, s.skip);
  s.error = ''; draw(); window.scrollTo(0, 0);
}

async function applySuggestion(id, btn) {
  const p = s.prospects.find(x => x.id === id); const g = s.sugg[id];
  btn.disabled = true;
  const patch = { next_follow_up_at: addDays(FOLLOW_DAYS[g.oncelik]).toISOString() };
  if (g.sicaklik) patch.temperature = g.sicaklik;
  const note = (s.notes[id] || '').trim();
  if (note) patch.notes = [p.notes, `Liste çalışması: ${note}`].filter(Boolean).join('\n').slice(0, 4000);
  const { data, error } = await supabase.from('prospects').update(patch).eq('id', id).select().single();
  if (error) { btn.disabled = false; toast(trError(error)); return; }
  s.prospects = s.prospects.map(x => (x.id === id ? { ...x, ...data } : x));
  s.batch = s.batch.filter(x => x.id !== id);
  s.skip.add(id);
  sessionStorage.setItem('nmd_list_skip', JSON.stringify([...s.skip].slice(-3000)));
  draw();
  toast(`${firstName(p.full_name)} güncellendi; takip ${FOLLOW_DAYS[g.oncelik] === 0 ? 'bugün' : FOLLOW_DAYS[g.oncelik] + ' gün sonra'}.`);
}

function writeMessage(id) {
  sessionStorage.setItem('nmd_draft', JSON.stringify({ prospectId: id, text: s.sugg[id]?.mesaj || '' }));
  location.hash = '#/iletisim';
}

// ====================================================================
function onClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/koc?tab=${s.tab}`); draw(); return; }
  const q = t.closest('[data-quick]');
  if (q) { sendCoach(QUICK_PROMPTS.find(x => x.id === q.dataset.quick).text); return; }
  const f = t.closest('[data-filter]');
  if (f) { s.filter = f.dataset.filter; s.batch = pickBatch(s.prospects, s.filter, s.skip); draw(); return; }
  const ap = t.closest('[data-apply]');
  if (ap) { applySuggestion(ap.dataset.apply, ap); return; }
  const wr = t.closest('[data-write]');
  if (wr) { writeMessage(wr.dataset.write); return; }
  const sk = t.closest('[data-skip]');
  if (sk) { s.skip.add(sk.dataset.skip); s.batch = s.batch.filter(x => x.id !== sk.dataset.skip); draw(); return; }
  const b = t.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'clear') { s.chat = []; localStorage.removeItem(chatKey()); draw(); }
  if (b.dataset.act === 'evaluate') evaluate();
  if (b.dataset.act === 'next') nextBatch();
}

function onSubmit(e) {
  e.preventDefault();
  if (e.target.dataset.form === 'coach') {
    const input = e.target.elements.namedItem('msg');
    const v = input.value; input.value = '';
    sendCoach(v);
  }
}
