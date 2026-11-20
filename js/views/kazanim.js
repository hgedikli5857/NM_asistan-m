// Kazanım birimi: Bugün listesi, Adaylar, Satış hunisi, aday kartı ve içe aktarma
import { supabase } from '../supabase.js';
import { esc, toast, trError, todayISO } from '../ui.js';
import {
  STAGES, TEMPS, KINDS, CHANNELS, SOURCES, ACTIVE_STAGES, QUIET_DAYS,
  stageLabel, addDays, relativeDay, daysBetween, waNumber,
  dueFollowUps, quietHotProspects, filterProspects, countByStage, tagCounts, parseTags,
  readLegacy, mapLegacy
} from '../kazanim/model.js';
import { crmSummaryHTML, crmMessages, messagesHTML, crmAutoSync, resultText, crmWaiting } from '../crm/client.js';

const TABS = [
  { id: 'bugun', label: 'Bugün', icon: 'ti-sun' },
  { id: 'adaylar', label: 'Adaylar', icon: 'ti-address-book' },
  { id: 'huni', label: 'Satış hunisi', icon: 'ti-filter' }
];
const IMPORT_FLAG = 'nmd_legacy_import_done';

let state = { tab: 'bugun', prospects: [], tasks: [], filter: { q: '', temp: '', stage: '', tag: '' } };
let el, ctx;

// ====================================================================
export async function renderKazanim(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  if (TABS.some(t => t.id === tab)) state.tab = tab;

  el.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Aday ve büyüme</div>
        <h1>Kazanım</h1>
        <p class="muted">Kimi arayacağım, ne yapacağım — hepsi burada.</p>
      </div>
      <button class="btn btn-gold" data-act="new"><i class="ti ti-user-plus" aria-hidden="true"></i> Aday ekle</button>
    </div>
    <div class="seg" role="tablist" aria-label="Kazanım sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="k-import"></div>
    <div id="k-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>
    <dialog id="k-dialog" class="sheet" aria-labelledby="k-dialog-title"></dialog>`;

  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', onInput);
  el.addEventListener('submit', onSubmit);

  await reload();
  // WhatsApp bot CRM'den arka planda senkron (30 dakikada bir)
  crmAutoSync().then(async r => {
    if (r && (r.yeni || r.telefonla_eslesen) && el?.isConnected) {
      toast(`WhatsApp CRM: ${resultText(r)}`);
      await reload();
    }
  });
}

async function reload() {
  const [p, t] = await Promise.all([
    supabase.from('prospects').select('*').is('deleted_at', null).order('updated_at', { ascending: false }).limit(10000),
    supabase.from('tasks').select('*').lte('due_date', todayISO()).order('created_at')
  ]);
  if (p.error) throw p.error;
  if (t.error) throw t.error;
  state.prospects = p.data;
  // Bugünün görevleri + bitmemiş eski görevler
  state.tasks = t.data.filter(x => !x.done_at || x.due_date === todayISO());
  renderImportBanner();
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  const body = el.querySelector('#k-body');
  if (state.tab === 'bugun') body.innerHTML = viewToday();
  else if (state.tab === 'adaylar') body.innerHTML = viewList();
  else body.innerHTML = viewFunnel();
}

// ====================================================================
// Bugün
function viewToday() {
  const due = dueFollowUps(state.prospects);
  const quiet = quietHotProspects(state.prospects);
  const waiting = crmWaiting(state.prospects);
  const openTasks = state.tasks.filter(t => !t.done_at).length;
  const doneTasks = state.tasks.length - openTasks;

  if (!state.prospects.length && !state.tasks.length) {
    return `<div class="card empty">
      <i class="ti ti-users-plus" aria-hidden="true"></i>
      <h2>Listen henüz boş</h2>
      <p class="muted">İşe sıcak listenle başla: tanıdığın, güvendiğin 20 kişiyi ekle.</p>
      <button class="btn btn-gold" data-act="new"><i class="ti ti-user-plus" aria-hidden="true"></i> İlk adayını ekle</button>
    </div>`;
  }

  return `
    <div class="grid grid-stats" style="margin-bottom:18px">
      ${mini('Takip zamanı', due.length, 'bugün ve gecikenler')}
      ${mini('Sessiz sıcaklar', quiet.length, `${QUIET_DAYS}+ gündür temas yok`)}
      ${mini('Görevler', `${doneTasks} / ${state.tasks.length}`, 'tamamlanan / toplam')}
      ${mini('Açık aday', state.prospects.filter(p => ACTIVE_STAGES.includes(p.stage)).length, 'hunide ilerleyen')}
    </div>

    ${waiting.length ? `<section class="card crm-card" style="margin-bottom:16px">
      <h2><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp'ta seni bekleyenler</h2>
      <p class="muted small">Bot bu konuşmaları sana devretti. Önce bunlara cevap ver.</p>
      <div class="p-list">${waiting.map(p => row(p, `<span class="small muted">${esc(p.extra.crm.conv.handoff_reason || p.extra.crm.conv.preview || 'Cevap bekliyor')}</span>`)).join('')}</div>
    </section>` : ''}

    <section class="card">
      <h2><i class="ti ti-bell-ringing" aria-hidden="true"></i> Takip zamanı gelenler</h2>
      ${due.length ? `<div class="p-list">${due.map(p => row(p, followNote(p))).join('')}</div>`
        : '<p class="muted small">Bugün için planlı takip yok. Aşağıdaki sessiz adaylarla başlayabilirsin.</p>'}
    </section>

    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-flame" aria-hidden="true"></i> Sessiz kalan sıcak adaylar</h2>
      ${quiet.length ? `<div class="p-list">${quiet.map(p => row(p, quietNote(p))).join('')}</div>`
        : '<p class="muted small">Tüm sıcak adaylarınla temas güncel. Harika.</p>'}
    </section>

    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-checklist" aria-hidden="true"></i> Bugünkü görevlerim</h2>
      <ul class="task-list">
        ${state.tasks.map(t => `<li class="${t.done_at ? 'done' : ''}">
          <label><input type="checkbox" data-task="${t.id}" ${t.done_at ? 'checked' : ''}>
          <span>${esc(t.title)}${t.due_date < todayISO() && !t.done_at ? ' <span class="badge warn">gecikti</span>' : ''}</span></label>
          <button class="icon-btn" data-act="del-task" data-id="${t.id}" aria-label="Görevi sil"><i class="ti ti-x" aria-hidden="true"></i></button>
        </li>`).join('') || '<li class="muted small">Henüz görev yok.</li>'}
      </ul>
      <form class="inline-form" data-form="task" novalidate>
        <input name="title" placeholder="Yeni görev (ör. 3 kişiye davet mesajı)" aria-label="Yeni görev" maxlength="200">
        <button class="btn btn-primary" type="submit">Ekle</button>
      </form>
      <p class="error" id="task-error" role="alert"></p>
    </section>`;
}

const mini = (label, value, hint) => `<div class="card stat"><div class="label">${esc(label)}</div>
  <div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;

function followNote(p) {
  const late = new Date(p.next_follow_up_at) < new Date(new Date().setHours(0, 0, 0, 0));
  return `<span class="badge ${late ? 'warn' : 'gold'}">Takip: ${esc(relativeDay(p.next_follow_up_at))}</span>`;
}
function quietNote(p) {
  const days = daysBetween(p.last_contact_at || p.created_at);
  return `<span class="badge warn">${days} gündür sessiz</span>`;
}

// ====================================================================
// Adaylar
function viewList() {
  const f = state.filter;
  const list = filterProspects(state.prospects, f);
  const tags = tagCounts(state.prospects);
  return `
    <div class="toolbar">
      <div class="field" style="margin:0;flex:1;min-width:180px">
        <input type="search" id="k-q" placeholder="İsim, telefon, not ara…" value="${esc(f.q)}" aria-label="Aday ara">
      </div>
      <div class="chips" role="group" aria-label="Sıcaklık filtresi">
        <button class="chip" data-temp="" aria-pressed="${!f.temp}">Hepsi</button>
        ${Object.entries(TEMPS).map(([id, t]) => `<button class="chip ${t.cls}" data-temp="${id}" aria-pressed="${f.temp === id}">${t.label}</button>`).join('')}
      </div>
      <div class="field" style="margin:0">
        <select id="k-stage" aria-label="Aşama filtresi">
          <option value="">Tüm aşamalar</option>
          ${STAGES.map(s => `<option value="${s.id}" ${f.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    </div>
    ${tags.length ? `<div class="chips tag-chips" role="group" aria-label="Etiket filtresi">
      <span class="small muted">Etiket:</span>
      <button class="chip" data-tag="" aria-pressed="${!f.tag}">Hepsi</button>
      ${tags.map(([t, n]) => `<button class="chip tag" data-tag="${esc(t)}" aria-pressed="${f.tag === t}">${t === '!' ? '<i class="ti ti-alert-circle" aria-hidden="true"></i> ! işaretli' : esc(t)} <span class="cnt">${n}</span></button>`).join('')}
    </div>` : ''}
    <p class="small muted" id="k-count">${list.length} aday</p>
    <div class="p-list card" id="k-list" style="padding:6px 0">
      ${list.length ? list.map(p => row(p)).join('') : '<p class="muted" style="padding:16px">Bu filtreye uyan aday yok.</p>'}
    </div>`;
}

function row(p, note = '') {
  const t = TEMPS[p.temperature] || TEMPS.ilik;
  const wa = waNumber(p.phone);
  return `<div class="p-row">
    <button class="p-main" data-act="open" data-id="${p.id}">
      <span class="avatar ${t.cls}" aria-hidden="true">${esc(initials(p.full_name))}</span>
      <span class="p-text">
        <span class="p-name">${esc(p.full_name)}</span>
        <span class="p-meta">
          <span class="badge ${t.cls}">${t.label}</span>
          <span class="badge">${esc(stageLabel(p.stage))}</span>
          ${(p.tags || []).map(t => `<span class="badge gold">${esc(t)}</span>`).join('')}
          ${note || (p.next_follow_up_at ? `<span class="small muted">Takip ${esc(relativeDay(p.next_follow_up_at))}</span>` : '')}
        </span>
      </span>
    </button>
    <span class="p-actions">
      ${wa ? `<a class="icon-btn" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="${esc(p.full_name)} WhatsApp"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i></a>` : ''}
      ${p.phone ? `<a class="icon-btn" href="tel:${esc(p.phone.replace(/\s/g, ''))}" aria-label="${esc(p.full_name)} ara"><i class="ti ti-phone" aria-hidden="true"></i></a>` : ''}
      <button class="icon-btn" data-act="log" data-id="${p.id}" aria-label="${esc(p.full_name)} temas kaydet"><i class="ti ti-message-plus" aria-hidden="true"></i></button>
    </span>
  </div>`;
}

function initials(name) {
  return String(name || '?').replace(/^[^\p{L}\d]+/u, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR');
}

// ====================================================================
// Satış hunisi
function viewFunnel() {
  const counts = countByStage(state.prospects);
  const open = ACTIVE_STAGES.reduce((n, s) => n + counts[s], 0);
  return `
    <p class="small muted">Kartlara dokunarak aday kartını aç, <i class="ti ti-arrow-right" aria-hidden="true"></i> ile bir sonraki aşamaya taşı.</p>
    <div class="funnel-summary">
      ${STAGES.map(s => `<div><strong>${counts[s.id]}</strong><span>${s.label}</span></div>`).join('')}
    </div>
    <div class="kanban" aria-label="Satış hunisi">
      ${STAGES.filter(s => s.id !== 'pasif').map((s, i, arr) => {
        const items = state.prospects.filter(p => p.stage === s.id);
        const next = arr[i + 1];
        return `<section class="k-col">
          <header><h3>${s.label}</h3><span class="badge">${items.length}</span></header>
          ${items.map(p => `<div class="k-card">
            <button class="k-open" data-act="open" data-id="${p.id}">
              <span class="dot ${(TEMPS[p.temperature] || TEMPS.ilik).cls}" aria-hidden="true"></span>${esc(p.full_name)}</button>
            ${next && s.id !== 'is_ortagi' ? `<button class="icon-btn sm" data-act="advance" data-id="${p.id}" data-to="${next.id}"
               aria-label="${esc(p.full_name)} → ${next.label}"><i class="ti ti-arrow-right" aria-hidden="true"></i></button>` : ''}
          </div>`).join('') || '<p class="small muted">Boş</p>'}
        </section>`;
      }).join('')}
    </div>
    <p class="small muted">Açık hunide ${open} aday · ${counts.pasif} pasif</p>`;
}

// ====================================================================
// Dialoglar
function openDialog(html) {
  const d = el.querySelector('#k-dialog');
  d.innerHTML = html;
  if (!d.open) d.showModal();
  d.querySelector('[autofocus]')?.focus();
}
function closeDialog() { const d = el.querySelector('#k-dialog'); if (d.open) d.close(); }

function formDialog(p = null) {
  const v = p || { temperature: 'ilik', stage: 'liste' };
  const follow = v.next_follow_up_at ? new Date(v.next_follow_up_at).toISOString().slice(0, 10) : '';
  const opt = (list, cur) => list.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  openDialog(`
    <form data-form="prospect" data-id="${p ? p.id : ''}" novalidate>
      <header class="sheet-head"><h2 id="k-dialog-title">${p ? 'Adayı düzenle' : 'Yeni aday'}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
      <div class="sheet-body">
        <div class="field"><label for="f-full">Ad soyad *</label>
          <input id="f-full" name="full_name" value="${esc(v.full_name)}" maxlength="120" autofocus></div>
        <div class="form-2">
          <div class="field"><label for="f-phone">Telefon</label>
            <input id="f-phone" name="phone" type="tel" value="${esc(v.phone)}" placeholder="05xx xxx xx xx"></div>
          <div class="field"><label for="f-ig">Instagram</label>
            <input id="f-ig" name="instagram" value="${esc(v.instagram)}" placeholder="@kullanici"></div>
        </div>
        <div class="field"><label>Sıcaklık</label>
          <div class="chips">${Object.entries(TEMPS).map(([id, t]) => `
            <label class="chip ${t.cls}"><input type="radio" name="temperature" value="${id}" ${v.temperature === id ? 'checked' : ''}>${t.label}</label>`).join('')}</div></div>
        <div class="form-2">
          <div class="field"><label for="f-stage">Aşama</label>
            <select id="f-stage" name="stage">${STAGES.map(s => `<option value="${s.id}" ${v.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
          <div class="field"><label for="f-follow">Sonraki takip</label>
            <input id="f-follow" name="follow" type="date" value="${follow}"></div>
        </div>
        <div class="form-2">
          <div class="field"><label for="f-channel">Kanal</label>
            <select id="f-channel" name="channel"><option value="">Seç</option>${opt(CHANNELS, v.channel)}</select></div>
          <div class="field"><label for="f-source">Kaynak</label>
            <select id="f-source" name="source"><option value="">Seç</option>${opt(SOURCES, v.source)}${v.source && !SOURCES.includes(v.source) ? `<option selected>${esc(v.source)}</option>` : ''}</select></div>
        </div>
        <div class="form-2">
          <div class="field"><label for="f-occ">Meslek</label><input id="f-occ" name="occupation" value="${esc(v.occupation)}"></div>
          <div class="field"><label for="f-int">İlgi alanları</label><input id="f-int" name="interests" value="${esc(v.interests)}"></div>
        </div>
        <div class="field"><label for="f-tags">Etiketler</label>
          <input id="f-tags" name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="Ör. !, aile, iş arkadaşı (virgülle ayır)"></div>
        <div class="field"><label for="f-notes">Notlar</label>
          <textarea id="f-notes" name="notes" rows="3">${esc(v.notes)}</textarea></div>
        ${p ? '' : `<label class="check"><input type="checkbox" name="kvkk">
          <span>Kişiye, bilgilerini iletişim amacıyla kaydettiğimi söyledim (KVKK aydınlatma).</span></label>`}
        <p class="hint-box"><i class="ti ti-shield-lock" aria-hidden="true"></i>
          Sağlık bilgisi gibi hassas verileri buraya yazma. Kayıtları yalnızca sen görürsün.</p>
        <p class="error" id="f-error" role="alert"></p>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
        <button type="submit" class="btn btn-primary">${p ? 'Kaydet' : 'Adayı ekle'}</button>
      </footer>
    </form>`);
}

async function detailDialog(id) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;
  const t = TEMPS[p.temperature] || TEMPS.ilik;
  const wa = waNumber(p.phone);
  openDialog(`
    <header class="sheet-head">
      <div style="display:flex;gap:12px;align-items:center">
        <span class="avatar lg ${t.cls}" aria-hidden="true">${esc(initials(p.full_name))}</span>
        <div><h2 id="k-dialog-title" style="margin:0">${esc(p.full_name)}</h2>
          <span class="badge ${t.cls}">${t.label}</span> <span class="badge">${esc(stageLabel(p.stage))}</span></div>
      </div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button>
    </header>
    <div class="sheet-body">
      <div class="quick">
        ${wa ? `<a class="btn btn-ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp</a>` : ''}
        ${p.phone ? `<a class="btn btn-ghost" href="tel:${esc(p.phone.replace(/\s/g, ''))}"><i class="ti ti-phone" aria-hidden="true"></i> Ara</a>` : ''}
        ${p.instagram ? `<a class="btn btn-ghost" href="https://instagram.com/${esc(p.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener"><i class="ti ti-brand-instagram" aria-hidden="true"></i> Instagram</a>` : ''}
        <a class="btn btn-ghost" href="#/iletisim?aday=${p.id}"><i class="ti ti-message-2" aria-hidden="true"></i> Mesaj yaz</a>
        <button class="btn btn-ghost" data-act="edit" data-id="${p.id}"><i class="ti ti-pencil" aria-hidden="true"></i> Düzenle</button>
      </div>

      <h3>Aşama</h3>
      <div class="chips stage-chips">
        ${STAGES.map(s => `<button class="chip" data-act="stage" data-id="${p.id}" data-to="${s.id}" aria-pressed="${p.stage === s.id}">${s.label}</button>`).join('')}
      </div>

      <form data-form="log" data-id="${p.id}" class="card log-card" novalidate>
        <h3>Temas kaydet</h3>
        <div class="chips">${Object.entries(KINDS).map(([k, l], i) => `
          <label class="chip"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}>${l}</label>`).join('')}</div>
        <div class="field" style="margin-top:10px"><label for="l-sum">Ne konuştunuz?</label>
          <textarea id="l-sum" name="summary" rows="2" placeholder="Ör. Ürünleri merak etti, cuma sunuma davet ettim"></textarea></div>
        <div class="field"><label>Sonraki takip</label>
          <div class="chips">
            ${[['1', 'Yarın'], ['3', '3 gün'], ['7', '1 hafta'], ['', 'Planlama']].map(([d, l], i) => `
              <label class="chip"><input type="radio" name="next" value="${d}" ${i === 1 ? 'checked' : ''}>${l}</label>`).join('')}
          </div></div>
        <p class="error" id="l-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">Kaydet</button>
      </form>

      ${crmSummaryHTML(p.extra?.crm, p.id)}

      <dl class="facts">
        ${fact('Telefon', p.phone)}${fact('Instagram', p.instagram)}${fact('Kanal', p.channel)}${fact('Kaynak', p.source)}
        ${fact('Meslek', p.occupation)}${fact('İlgi alanları', p.interests)}
        ${fact('Sonraki takip', p.next_follow_up_at && relativeDay(p.next_follow_up_at))}
        ${fact('Son temas', p.last_contact_at && relativeDay(p.last_contact_at))}
        ${fact('Notlar', p.notes)}
      </dl>

      <h3>Geçmiş</h3>
      <ol class="timeline" id="k-timeline"><li class="muted small">Yükleniyor…</li></ol>

      <div class="danger-zone">
        <button class="btn btn-ghost" data-act="delete" data-id="${p.id}"><i class="ti ti-trash" aria-hidden="true"></i> Adayı sil</button>
      </div>
    </div>`);

  const [{ data: logs }, { data: consents }] = await Promise.all([
    supabase.from('interactions').select('*').eq('prospect_id', p.id).order('occurred_at', { ascending: false }).limit(50),
    supabase.from('consents').select('*').eq('prospect_id', p.id).order('recorded_at', { ascending: false })
  ]);
  const tl = el.querySelector('#k-timeline');
  if (!tl) return;
  const items = [
    ...(logs || []).map(l => ({ at: l.occurred_at, html: `<strong>${esc(KINDS[l.kind] || l.kind)}</strong>${l.summary ? ' — ' + esc(l.summary) : ''}` })),
    ...(consents || []).map(c => ({ at: c.recorded_at, html: `<i class="ti ti-shield-check" aria-hidden="true"></i> KVKK aydınlatma kaydedildi` })),
    { at: p.created_at, html: `Listeye eklendi${p.source ? ' · ' + esc(p.source) : ''}` }
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  tl.innerHTML = items.map(i => `<li><span class="when">${esc(new Date(i.at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>${i.html}</li>`).join('');
}

async function showCrmMessages(btn, id) {
  const box = el.querySelector('#crm-msgs');
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  btn.disabled = true;
  box.hidden = false;
  box.innerHTML = '<p class="muted small">Yükleniyor…</p>';
  try {
    box.innerHTML = messagesHTML(await crmMessages(id, 80));
    box.querySelector('.chat')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  } catch (err) {
    box.innerHTML = `<p class="error">Mesajlar alınamadı: ${esc(err.message)}</p>`;
  } finally { btn.disabled = false; }
}

const fact = (label, value) => (value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '');

// ====================================================================
// Olaylar
function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; history.replaceState(null, '', `#/kazanim?tab=${state.tab}`); draw(); return; }

  const tempBtn = e.target.closest('[data-temp]');
  if (tempBtn) { state.filter.temp = tempBtn.dataset.temp; draw(); return; }
  const tagBtn = e.target.closest('[data-tag]');
  if (tagBtn) { state.filter.tag = tagBtn.dataset.tag; draw(); return; }

  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'new': formDialog(); break;
    case 'close': closeDialog(); break;
    case 'open': detailDialog(id); break;
    case 'log': detailDialog(id).then(() => el.querySelector('#l-sum')?.focus()); break;
    case 'edit': formDialog(state.prospects.find(p => p.id === id)); break;
    case 'stage': case 'advance': changeStage(id, b.dataset.to, b.dataset.act === 'stage'); break;
    case 'delete': confirmDelete(b, id); break;
    case 'del-task': deleteTask(id); break;
    case 'import': runImport(b); break;
    case 'crm-msgs': showCrmMessages(b, id); break;
    case 'import-hide': localStorage.setItem(IMPORT_FLAG, 'hidden'); renderImportBanner(); break;
  }
}

function onChange(e) {
  if (e.target.id === 'k-stage') { state.filter.stage = e.target.value; draw(); }
  if (e.target.dataset.task) toggleTask(e.target.dataset.task, e.target.checked);
}

function onInput(e) {
  if (e.target.id !== 'k-q') return;
  state.filter.q = e.target.value;
  // Arama kutusunu yeniden çizmeden yalnızca listeyi güncelle (odak kaybolmasın)
  const list = filterProspects(state.prospects, state.filter);
  el.querySelector('#k-count').textContent = `${list.length} aday`;
  el.querySelector('#k-list').innerHTML = list.length ? list.map(p => row(p)).join('') : '<p class="muted" style="padding:16px">Bu filtreye uyan aday yok.</p>';
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const kind = form.dataset.form;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (kind === 'prospect') await saveProspect(form);
    else if (kind === 'log') await saveLog(form);
    else if (kind === 'task') await addTask(form);
  } finally {
    if (btn.isConnected) btn.disabled = false;
  }
}

// ====================================================================
// Kayıt işlemleri
async function saveProspect(form) {
  const err = form.querySelector('#f-error');
  const f = name => form.elements.namedItem(name);
  const full_name = f('full_name').value.trim();
  if (!full_name) { err.textContent = 'Ad soyad zorunlu.'; f('full_name').focus(); return; }
  err.textContent = '';
  const followVal = f('follow').value;
  const payload = {
    full_name,
    phone: f('phone').value.trim() || null,
    instagram: f('instagram').value.trim() || null,
    temperature: form.querySelector('[name="temperature"]:checked')?.value || 'ilik',
    stage: f('stage').value,
    channel: f('channel').value || null,
    source: f('source').value || null,
    occupation: f('occupation').value.trim() || null,
    interests: f('interests').value.trim() || null,
    notes: f('notes').value.trim() || null,
    tags: parseTags(f('tags').value),
    next_follow_up_at: followVal ? new Date(followVal + 'T10:00:00').toISOString() : null
  };

  const id = form.dataset.id;
  let saved;
  if (id) {
    const { data, error } = await supabase.from('prospects').update(payload).eq('id', id).select().single();
    if (error) { err.textContent = trError(error); return; }
    saved = data;
    state.prospects = state.prospects.map(p => (p.id === id ? saved : p));
  } else {
    const { data, error } = await supabase.from('prospects').insert({ ...payload, org_id: ctx.org.id }).select().single();
    if (error) { err.textContent = trError(error); return; }
    saved = data;
    state.prospects.unshift(saved);
    if (f('kvkk')?.checked) {
      await supabase.from('consents').insert({ org_id: ctx.org.id, prospect_id: saved.id, kind: 'kvkk_aydinlatma', granted: true, method: 'sözlü / mesaj' });
    }
  }
  closeDialog();
  draw();
  toast(id ? 'Aday güncellendi.' : `${saved.full_name} listeye eklendi.`);
}

async function saveLog(form) {
  const id = form.dataset.id;
  const err = form.querySelector('#l-error');
  const kind = form.querySelector('[name="kind"]:checked')?.value || 'mesaj';
  const summary = form.elements.namedItem('summary').value.trim();
  const next = form.querySelector('[name="next"]:checked')?.value;
  if (kind === 'not' && !summary) { err.textContent = 'Not için bir şey yaz.'; return; }
  err.textContent = '';

  const { error } = await supabase.from('interactions').insert({ org_id: ctx.org.id, prospect_id: id, kind, summary: summary || null });
  if (error) { err.textContent = trError(error); return; }

  const p = state.prospects.find(x => x.id === id);
  const patch = { next_follow_up_at: next ? addDays(+next).toISOString() : null };
  if (kind !== 'not' && p.stage === 'liste') patch.stage = 'temas';
  if (kind === 'sunum' && ['liste', 'temas', 'davet'].includes(p.stage)) patch.stage = 'sunum';
  const { data, error: e2 } = await supabase.from('prospects').update(patch).eq('id', id).select().single();
  if (e2) { err.textContent = trError(e2); return; }
  state.prospects = state.prospects.map(x => (x.id === id ? data : x));
  draw();
  await detailDialog(id);
  toast(next ? `Kaydedildi. Takip: ${relativeDay(data.next_follow_up_at)}.` : 'Temas kaydedildi.');
}

async function changeStage(id, to, reopen) {
  const { data, error } = await supabase.from('prospects').update({ stage: to }).eq('id', id).select().single();
  if (error) { toast(trError(error)); return; }
  state.prospects = state.prospects.map(p => (p.id === id ? data : p));
  draw();
  if (reopen) await detailDialog(id);
  toast(`${data.full_name} → ${stageLabel(to)}${to === 'is_ortagi' ? ' 🎉' : ''}`);
}

function confirmDelete(btn, id) {
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.classList.add('btn-danger');
    btn.innerHTML = '<i class="ti ti-alert-triangle" aria-hidden="true"></i> Emin misin? Tekrar dokun';
    return;
  }
  supabase.from('prospects').update({ deleted_at: new Date().toISOString() }).eq('id', id).then(({ error }) => {
    if (error) { toast(trError(error)); return; }
    state.prospects = state.prospects.filter(p => p.id !== id);
    closeDialog(); draw(); toast('Aday silindi.');
  });
}

// ---------- Görevler ----------
async function addTask(form) {
  const input = form.elements.namedItem('title');
  const err = el.querySelector('#task-error');
  const title = input.value.trim();
  if (!title) { err.textContent = 'Görev için bir şey yaz.'; input.focus(); return; }
  err.textContent = '';
  const { data, error } = await supabase.from('tasks').insert({ org_id: ctx.org.id, title, due_date: todayISO() }).select().single();
  if (error) { err.textContent = trError(error); return; }
  state.tasks.push(data);
  draw();
  el.querySelector('[data-form="task"] input')?.focus();
}

async function toggleTask(id, done) {
  const { data, error } = await supabase.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id).select().single();
  if (error) { toast(trError(error)); return; }
  state.tasks = state.tasks.map(t => (t.id === id ? data : t));
  draw();
  if (done && state.tasks.every(t => t.done_at)) toast('Bugünün tüm görevleri tamam. Küçük ama istikrarlı adımlar!');
}

async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  state.tasks = state.tasks.filter(t => t.id !== id);
  draw();
}

// ====================================================================
// Eski NM Asistanı'ndan içe aktarma (aynı sitede, aynı tarayıcıda kayıtlı veriler)
function renderImportBanner() {
  const box = el.querySelector('#k-import');
  if (!box) return;
  const legacy = readLegacy(localStorage);
  const imported = new Set(state.prospects.map(p => p.legacy_id).filter(Boolean));
  const pending = legacy.filter(p => !imported.has(String(p.id ?? `${p.isim}-${p.tarih}`)));
  if (!pending.length || localStorage.getItem(IMPORT_FLAG) === 'hidden') { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card import-card">
    <i class="ti ti-database-import" aria-hidden="true"></i>
    <div><strong>Eski NM Asistanı'nda ${pending.length} aday bulundu.</strong>
      <p class="small muted">Tek tuşla buraya taşıyabilirsin. Sağlık ve gelir bilgileri KVKK gereği taşınmaz, eski uygulamada kalır.</p></div>
    <div class="import-actions">
      <button class="btn btn-gold" data-act="import">İçe aktar</button>
      <button class="btn btn-ghost" data-act="import-hide">Şimdi değil</button>
    </div></div>`;
}

async function runImport(btn) {
  btn.disabled = true;
  btn.textContent = 'Aktarılıyor…';
  const imported = new Set(state.prospects.map(p => p.legacy_id).filter(Boolean));
  const rows = readLegacy(localStorage).map(p => mapLegacy(p, ctx.org.id)).filter(r => !imported.has(r.legacy_id));
  // Aynı eski id iki kez varsa birini al
  const unique = [...new Map(rows.map(r => [r.legacy_id, r])).values()];
  let done = 0;
  for (let i = 0; i < unique.length; i += 200) {
    // defaultToNull:false → bir satırda olmayan alan için veritabanı varsayılanı kullanılır
    const { data, error } = await supabase.from('prospects').insert(unique.slice(i, i + 200), { defaultToNull: false }).select();
    if (error) { toast(trError(error)); btn.disabled = false; btn.textContent = 'Tekrar dene'; return; }
    state.prospects.unshift(...data);
    done += data.length;
  }
  localStorage.setItem(IMPORT_FLAG, 'done');
  renderImportBanner();
  draw();
  toast(`${done} aday içe aktarıldı.`);
}
