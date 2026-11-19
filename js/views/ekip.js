// Ekip birimi: ekibim, soy ağacı, takvim (randevu + ekip etkinlikleri), sıralama, davet
import { supabase, isLead } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { relativeDay } from '../kazanim/model.js';
import { buildTree } from '../ekip/tree.js';
import { pickerHTML, bindPicker } from '../ui/picker.js';

const KINDS = { sunum: 'Sunum', birebir: 'Birebir görüşme', egitim: 'Eğitim', etkinlik: 'Etkinlik', diger: 'Diğer' };
const STATUS = { planli: 'Planlı', yapildi: 'Yapıldı', gelmedi: 'Gelmedi', iptal: 'İptal' };
const RSVP = { geliyorum: 'Geliyorum', belki: 'Belki', gelemem: 'Gelemem' };
const MEMBER_STATUS = { active: ['Aktif', 'ok'], quiet: ['Sessiz', 'warn'], passive: ['Pasif', ''] };

let el, ctx, s;

export async function renderEkip(target, context) {
  el = target; ctx = context;
  const lead = isLead(ctx);
  const tabs = [
    { id: 'ekibim', label: 'Ekibim', icon: 'ti-users' },
    { id: 'agac', label: 'Soy ağacı', icon: 'ti-hierarchy-2' },
    { id: 'takvim', label: 'Takvim', icon: 'ti-calendar-event' },
    { id: 'siralama', label: 'Sıralama', icon: 'ti-trophy' },
    ...(lead ? [{ id: 'davet', label: 'Davet et', icon: 'ti-user-plus' }] : [])
  ];
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  s = { tab: tabs.some(t => t.id === tab) ? tab : 'ekibim', tabs, lead };

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Ekip ve sistem</div><h1>Ekip</h1>
        <p class="muted">${esc(ctx.org.name)} · ${lead ? 'Ekibini gör, destekle, büyüt.' : 'Ekibinle birlikte büyü.'}</p></div>
      ${lead ? '<a class="btn btn-gold" href="#/ekip?tab=davet"><i class="ti ti-user-plus" aria-hidden="true"></i> Davet et</a>' : ''}
    </div>
    <div class="seg" role="tablist" aria-label="Ekip sekmeleri">
      ${tabs.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="e-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>
    <dialog id="e-dialog" class="sheet" aria-labelledby="e-dialog-title"></dialog>`;

  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
  await load();
}

async function load() {
  const from = new Date(Date.now() - 14 * 864e5).toISOString();
  const [team, appts, prospects, invites] = await Promise.all([
    supabase.rpc('team_overview', { p_org: ctx.org.id }),
    supabase.from('appointments').select('*').gte('starts_at', from).order('starts_at').limit(300),
    supabase.from('prospects').select('id, full_name, phone, instagram').is('deleted_at', null).order('full_name').limit(5000),
    s.lead ? supabase.from('invitations').select('*').eq('org_id', ctx.org.id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] })
  ]);
  for (const r of [team, appts, prospects, invites]) if (r.error) throw r.error;
  s.team = team.data;
  // Bu ekibe ait olan: kendi randevularım (her ekipte) + bu ekibin ortak etkinlikleri
  s.appts = appts.data.filter(a => a.owner_id === ctx.user.id || (a.is_team_event && a.org_id === ctx.org.id));
  s.prospects = prospects.data;
  s.invites = invites.data;
  const teamIds = s.appts.filter(a => a.is_team_event).map(a => a.id);
  s.rsvps = [];
  if (teamIds.length) {
    const { data } = await supabase.from('event_rsvps').select('*').in('appointment_id', teamIds);
    s.rsvps = data || [];
  }
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  el.querySelector('#e-body').innerHTML = { ekibim: viewTeam, agac: viewTree, takvim: viewCalendar, siralama: viewRanking, davet: viewInvites }[s.tab]();
}

const nameOf = id => s.team.find(m => m.user_id === id)?.full_name || '—';
const roleName = r => ({ owner: 'Ekip sahibi', leader: 'Lider', member: 'Üye' }[r] || r);
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR');

// ====================================================================
// Ekibim
function viewTeam() {
  const owner = ctx.membership.role === 'owner';
  const counts = { active: 0, quiet: 0, passive: 0 };
  s.team.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
  const solo = s.team.length <= 1;
  return `
    <div class="grid grid-stats" style="margin-bottom:16px">
      ${mini('Ekip', s.team.length, 'kişi')}${mini('Aktif', counts.active, 'son 14 günde temas')}
      ${mini('Sessiz', counts.quiet, '14+ gündür temas yok')}${mini('Pasif', counts.passive, 'sahip tarafından işaretli')}
    </div>
    ${solo ? `<div class="card empty"><i class="ti ti-users-plus" aria-hidden="true"></i><h2>Ekibin henüz sadece sen</h2>
      <p class="muted">${s.lead ? 'Davet linki oluştur ve WhatsApp\'tan gönder. Katılan kişi burada görünür.' : 'Ekip arkadaşların katıldıkça burada görünecek.'}</p>
      ${s.lead ? '<a class="btn btn-gold" href="#/ekip?tab=davet">Davet linki oluştur</a>' : ''}</div>` : ''}
    <div class="member-grid">
      ${s.team.map(m => {
        const [label, cls] = MEMBER_STATUS[m.status] || ['', ''];
        const me = m.user_id === ctx.user.id;
        return `<article class="card member">
          <header><span class="avatar" aria-hidden="true">${esc(initials(m.full_name))}</span>
            <div><h3>${esc(m.full_name || 'İsimsiz')}${me ? ' <span class="small muted">(sen)</span>' : ''}</h3>
              <span class="badge">${esc(roleName(m.role))}</span> <span class="badge ${cls}">${label}</span></div></header>
          <p class="small muted">${m.career_level ? esc(m.career_level) + ' · ' : ''}Katılım: ${esc(new Date(m.joined_at).toLocaleDateString('tr-TR'))}
            ${m.sponsor_user_id ? ' · Sponsor: ' + esc(nameOf(m.sponsor_user_id)) : ''}</p>
          ${s.lead ? `<dl class="mstats">
            <div><dt>7 gün temas</dt><dd>${m.contacts_7d}</dd></div><div><dt>7 gün davet</dt><dd>${m.invites_7d}</dd></div>
            <div><dt>7 gün sunum</dt><dd>${m.presentations_7d}</dd></div><div><dt>Açık aday</dt><dd>${m.active_prospects}</dd></div>
            <div><dt>Akademi</dt><dd>${m.academy_done}</dd></div><div><dt>Son temas</dt><dd>${m.last_activity_at ? esc(relativeDay(m.last_activity_at)) : '—'}</dd></div>
          </dl>` : `<p class="small">Akademi: ${m.academy_done} adım · ${m.points_30d} puan</p>`}
          ${owner && !me && m.role !== 'owner' ? `<footer class="member-actions">
            <select data-role="${m.user_id}" aria-label="${esc(m.full_name)} rolü">
              <option value="member" ${m.role === 'member' ? 'selected' : ''}>Üye</option>
              <option value="leader" ${m.role === 'leader' ? 'selected' : ''}>Lider</option></select>
            <button class="btn btn-ghost sm" data-act="passive" data-id="${m.user_id}" data-to="${m.status === 'passive' ? 'active' : 'passive'}">
              ${m.status === 'passive' ? 'Aktif yap' : 'Pasif yap'}</button>
            <button class="btn btn-ghost sm" data-act="remove" data-id="${m.user_id}">Ekipten çıkar</button>
          </footer>` : ''}
        </article>`;
      }).join('')}
    </div>
    ${ctx.membership.role !== 'owner' ? `<div class="danger-zone"><button class="btn btn-ghost" data-act="leave">
      <i class="ti ti-door-exit" aria-hidden="true"></i> Bu ekipten ayrıl</button></div>` : ''}
    <p class="small muted" style="margin-top:14px"><i class="ti ti-lock" aria-hidden="true"></i>
      Adayların kişisel bilgileri ekip arkadaşlarıyla paylaşılmaz; liderler yalnızca toplu sayıları görür.</p>`;
}
const mini = (label, value, hint) => `<div class="card stat"><div class="label">${esc(label)}</div>
  <div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;

// ====================================================================
// Soy ağacı
function viewTree() {
  const roots = buildTree(s.team);
  const node = n => `<li><div class="tree-node ${n.user_id === ctx.user.id ? 'me' : ''}">
      <span class="avatar sm" aria-hidden="true">${esc(initials(n.full_name))}</span>
      <span><strong>${esc(n.full_name || 'İsimsiz')}</strong><span class="small muted"> · ${esc(roleName(n.role))}${n.children.length ? ` · ${n.children.length} kişi` : ''}</span></span>
      <span class="dot ${n.status === 'active' ? 'ok' : n.status === 'quiet' ? 'warm' : ''}" title="${esc(MEMBER_STATUS[n.status]?.[0] || '')}"></span>
    </div>${n.children.length ? `<ul>${n.children.map(node).join('')}</ul>` : ''}</li>`;
  return `<section class="card">
    <h2><i class="ti ti-hierarchy-2" aria-hidden="true"></i> Sponsor ilişkisine göre ekip</h2>
    <ul class="tree">${roots.map(node).join('')}</ul>
    <p class="small muted">Yeşil: son 14 günde aktif · Sarı: sessiz. Birini davet ettiğinde sponsoru sen olursun.</p>
  </section>`;
}

// ====================================================================
// Takvim
function viewCalendar() {
  const now = Date.now();
  const upcoming = s.appts.filter(a => new Date(a.starts_at).getTime() >= now - 2 * 3600e3 && a.status === 'planli');
  const past = s.appts.filter(a => !upcoming.includes(a)).reverse();
  const groups = {};
  upcoming.forEach(a => { const k = new Date(a.starts_at).toDateString(); (groups[k] ||= []).push(a); });
  return `
    <div class="toolbar"><button class="btn btn-gold" data-act="new-appt"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Randevu ekle</button>
      ${s.lead ? '<button class="btn btn-ghost" data-act="new-event"><i class="ti ti-speakerphone" aria-hidden="true"></i> Ekip etkinliği</button>' : ''}</div>
    <section class="card">
      <h2><i class="ti ti-calendar-event" aria-hidden="true"></i> Yaklaşanlar</h2>
      ${Object.entries(groups).map(([k, list]) => `<h3 class="day-h">${esc(new Date(k).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
        ${list.map(apptRow).join('')}`).join('') || '<p class="muted small">Yaklaşan randevu yok. Haftada en az 3 sunum hedefle.</p>'}
    </section>
    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-history" aria-hidden="true"></i> Son 14 gün</h2>
      ${past.map(apptRow).join('') || '<p class="muted small">Kayıt yok.</p>'}
    </section>`;
}

function apptRow(a) {
  const mine = a.owner_id === ctx.user.id;
  const time = new Date(a.starts_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const prospect = s.prospects.find(p => p.id === a.prospect_id);
  const my = s.rsvps.find(r => r.appointment_id === a.id && r.user_id === ctx.user.id)?.status;
  const going = s.rsvps.filter(r => r.appointment_id === a.id && r.status === 'geliyorum').length;
  const isUrl = /^https?:\/\//i.test(a.location || '');
  return `<div class="appt ${a.status}">
    <div class="appt-time">${esc(time)}</div>
    <div class="appt-main">
      <strong>${esc(a.title)}</strong>
      <span class="small muted">${esc(KINDS[a.kind] || a.kind)}${prospect ? ' · ' + esc(prospect.full_name) : ''}${a.is_team_event ? ` · Ekip etkinliği · ${going} katılımcı` : ''}</span>
      ${a.location ? `<span class="small">${isUrl ? `<a href="${esc(a.location)}" target="_blank" rel="noopener">Bağlantıya git</a>` : esc(a.location)}</span>` : ''}
      ${a.notes ? `<span class="small muted">${esc(a.notes)}</span>` : ''}
    </div>
    <div class="appt-actions">
      ${a.is_team_event && !mine ? Object.entries(RSVP).map(([k, l]) => `<button class="chip" data-rsvp="${a.id}" data-to="${k}" aria-pressed="${my === k}">${l}</button>`).join('') : ''}
      ${mine ? (a.status === 'planli'
        ? `<button class="chip" data-status="${a.id}" data-to="yapildi">Yapıldı</button><button class="chip" data-status="${a.id}" data-to="gelmedi">Gelmedi</button>
           <button class="icon-btn sm" data-act="del-appt" data-id="${a.id}" aria-label="Randevuyu sil"><i class="ti ti-trash" aria-hidden="true"></i></button>`
        : `<span class="badge ${a.status === 'yapildi' ? 'ok' : 'warn'}">${STATUS[a.status]}</span>`) : ''}
    </div></div>`;
}

function apptDialog(teamEvent = false) {
  const d = el.querySelector('#e-dialog');
  const def = new Date(Date.now() + 864e5); def.setHours(20, 0, 0, 0);
  const local = new Date(def.getTime() - def.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  d.innerHTML = `<form data-form="appt" data-team="${teamEvent ? 1 : 0}" novalidate>
    <header class="sheet-head"><h2 id="e-dialog-title">${teamEvent ? 'Ekip etkinliği' : 'Yeni randevu'}</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><label for="a-title">Başlık *</label><input id="a-title" name="title" maxlength="160" autofocus
        placeholder="${teamEvent ? 'Ör. Perşembe online tanıtım' : 'Ör. Ayşe ile sunum'}"></div>
      <div class="form-2">
        <div class="field"><label for="a-kind">Tür</label><select id="a-kind" name="kind">
          ${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === (teamEvent ? 'etkinlik' : 'sunum') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="a-when">Tarih ve saat *</label><input id="a-when" name="when" type="datetime-local" value="${local}"></div>
      </div>
      <div class="form-2">
        <div class="field"><label for="a-dur">Süre (dk)</label><input id="a-dur" name="duration" type="number" min="5" max="1440" value="${teamEvent ? 60 : 45}"></div>
        ${teamEvent ? '' : `<div class="field">${pickerHTML({ id: 'a-pick', label: 'Aday (isteğe bağlı)', prospects: s.prospects, name: 'prospect' })}</div>`}
      </div>
      <div class="field"><label for="a-loc">Yer ya da bağlantı</label><input id="a-loc" name="location" placeholder="Ör. Zoom linki veya adres"></div>
      <div class="field"><label for="a-notes">Not</label><textarea id="a-notes" name="notes" rows="2"></textarea></div>
      <p class="error" id="a-error" role="alert"></p>
    </div>
    <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  d.showModal();
  if (!teamEvent) bindPicker(d, { id: 'a-pick', prospects: s.prospects });
}

// ====================================================================
// Sıralama (son 30 gün puanı)
function viewRanking() {
  const list = [...s.team].sort((a, b) => b.points_30d - a.points_30d);
  return `<section class="card">
    <h2><i class="ti ti-trophy" aria-hidden="true"></i> Son 30 gün aktivite sıralaması</h2>
    <ol class="rank">${list.map((m, i) => `<li class="${m.user_id === ctx.user.id ? 'me' : ''}">
      <span class="rank-no">${i + 1}</span><span class="avatar sm" aria-hidden="true">${esc(initials(m.full_name))}</span>
      <span class="rank-name">${esc(m.full_name || 'İsimsiz')}</span><strong>${m.points_30d}</strong></li>`).join('')}</ol>
    <p class="small muted">Puan: temas 1 · davet 2 · sunum 3 · akademi adımı 2 · yeni müşteri/iş ortağı 5.
      Sıralama motivasyon içindir; kimseyi baskı altına almak için kullanma.</p>
  </section>`;
}

// ====================================================================
// Davet
function inviteUrl(code) { return `${location.origin}${location.pathname}#/davet/${code}`; }

function viewInvites() {
  const owner = ctx.membership.role === 'owner';
  const valid = i => !i.revoked && new Date(i.expires_at) > new Date() && i.uses < i.max_uses;
  return `<div class="compose">
    <form class="card" data-form="invite" novalidate>
      <h2><i class="ti ti-link" aria-hidden="true"></i> Davet linki oluştur</h2>
      <p class="small muted">Linki alan kişi kayıt olup ekibine katılır; sponsoru sen olursun. Link 14 gün geçerlidir.</p>
      <div class="form-2">
        <div class="field"><label for="v-role">Rol</label><select id="v-role" name="role">
          <option value="member">Üye</option>${owner ? '<option value="leader">Lider</option>' : ''}</select></div>
        <div class="field"><label for="v-uses">Kaç kişi kullanabilir?</label><input id="v-uses" name="uses" type="number" min="1" max="100" value="1"></div>
      </div>
      <p class="error" id="v-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Link oluştur</button>
    </form>
    <section class="card">
      <h2><i class="ti ti-list" aria-hidden="true"></i> Davetler</h2>
      <ul class="entry-list">${s.invites.map(i => `<li>
        <span><strong>${i.role === 'leader' ? 'Lider' : 'Üye'}</strong> <span class="small muted">· ${i.uses}/${i.max_uses} kullanıldı ·
          ${valid(i) ? 'son gün ' + esc(new Date(i.expires_at).toLocaleDateString('tr-TR')) : i.revoked ? 'iptal' : 'geçersiz'}</span></span>
        ${valid(i) ? `<span class="quick">
          <button class="icon-btn sm" data-copy="${i.code}" aria-label="Linki kopyala"><i class="ti ti-copy" aria-hidden="true"></i></button>
          <a class="icon-btn sm" href="https://wa.me/?text=${encodeURIComponent('Seni NM Departmanı\'ndaki ekibime davet ediyorum. Bu linkten katılabilirsin: ' + inviteUrl(i.code))}" target="_blank" rel="noopener" aria-label="WhatsApp ile gönder"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i></a>
          <button class="icon-btn sm" data-act="revoke" data-id="${i.id}" aria-label="İptal et"><i class="ti ti-ban" aria-hidden="true"></i></button></span>` : ''}
      </li>`).join('') || '<li class="muted small">Henüz davet yok.</li>'}</ul>
    </section></div>`;
}

// ====================================================================
// Olaylar
function onClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/ekip?tab=${s.tab}`); draw(); return; }
  const st = t.closest('[data-status]');
  if (st) return setStatus(st.dataset.status, st.dataset.to);
  const rs = t.closest('[data-rsvp]');
  if (rs) return setRsvp(rs.dataset.rsvp, rs.dataset.to);
  const cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard.writeText(inviteUrl(cp.dataset.copy)).then(() => toast('Davet linki kopyalandı.'), () => toast(inviteUrl(cp.dataset.copy))); return; }
  const b = t.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'new-appt': apptDialog(false); break;
    case 'new-event': apptDialog(true); break;
    case 'close': el.querySelector('#e-dialog').close(); break;
    case 'del-appt': confirmThen(b, () => supabase.from('appointments').delete().eq('id', id), () => { s.appts = s.appts.filter(a => a.id !== id); }); break;
    case 'revoke': updateRow('invitations', id, { revoked: true }, row => { s.invites = s.invites.map(i => (i.id === id ? row : i)); }); break;
    case 'passive': memberUpdate(id, { status: b.dataset.to }); break;
    case 'remove': confirmThen(b, () => supabase.from('memberships').update({ status: 'left' }).eq('org_id', ctx.org.id).eq('user_id', id),
      () => { s.team = s.team.filter(m => m.user_id !== id); }); break;
    case 'leave': confirmThen(b, () => supabase.rpc('leave_team', { p_org: ctx.org.id }), () => {
      localStorage.removeItem('nmd_active_org'); location.hash = '#/'; document.dispatchEvent(new CustomEvent('ctx:reload'));
    }); break;
  }
}

function onChange(e) {
  if (e.target.dataset.role) memberUpdate(e.target.dataset.role, { role: e.target.value });
}

function confirmThen(btn, run, after) {
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.classList.add('btn-danger'); toast('Onaylamak için tekrar dokun.'); return; }
  run().then(({ error }) => { if (error) { toast(trError(error)); return; } after(); draw(); toast('Tamam.'); });
}

async function updateRow(table, id, patch, after) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
  if (error) { toast(trError(error)); return; }
  after(data); draw();
}

async function memberUpdate(userId, patch) {
  const { error } = await supabase.from('memberships').update(patch).eq('org_id', ctx.org.id).eq('user_id', userId);
  if (error) { toast(trError(error)); return; }
  const { data } = await supabase.rpc('team_overview', { p_org: ctx.org.id });
  if (data) s.team = data;
  draw(); toast('Güncellendi.');
}

async function setStatus(id, to) {
  const a = s.appts.find(x => x.id === id);
  const { data, error } = await supabase.from('appointments').update({ status: to }).eq('id', id).select().single();
  if (error) { toast(trError(error)); return; }
  s.appts = s.appts.map(x => (x.id === id ? data : x));
  // Adaylı bir sunum yapıldıysa Kazanım'a sunum teması olarak işle (göstergelere yansır)
  if (to === 'yapildi' && a.prospect_id && ['sunum', 'birebir'].includes(a.kind)) {
    await supabase.from('interactions').insert({ org_id: ctx.org.id, prospect_id: a.prospect_id, kind: a.kind === 'sunum' ? 'sunum' : 'yuz_yuze', summary: a.title });
    toast('Yapıldı olarak işaretlendi ve adayın geçmişine eklendi.');
  } else toast(`${STATUS[to]} olarak işaretlendi.`);
  draw();
}

async function setRsvp(id, to) {
  const { data, error } = await supabase.from('event_rsvps').upsert({ appointment_id: id, user_id: ctx.user.id, status: to, updated_at: new Date().toISOString() }).select().single();
  if (error) { toast(trError(error)); return; }
  s.rsvps = [...s.rsvps.filter(r => !(r.appointment_id === id && r.user_id === ctx.user.id)), data];
  draw();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (form.dataset.form === 'appt') await saveAppt(form);
    if (form.dataset.form === 'invite') await createInvite(form);
  } finally { if (btn.isConnected) btn.disabled = false; }
}

async function saveAppt(form) {
  const f = n => form.elements.namedItem(n);
  const err = form.querySelector('#a-error');
  const title = f('title').value.trim();
  const when = f('when').value;
  const duration = Number(f('duration').value);
  if (!title) { err.textContent = 'Başlık zorunlu.'; return; }
  if (!when || isNaN(new Date(when))) { err.textContent = 'Tarih ve saat seç.'; return; }
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) { err.textContent = 'Süre 5-1440 dakika olmalı.'; return; }
  err.textContent = '';
  const team = form.dataset.team === '1';
  const row = { org_id: ctx.org.id, title, kind: f('kind').value, starts_at: new Date(when).toISOString(), duration_min: duration,
    location: f('location').value.trim() || null, notes: f('notes').value.trim() || null, is_team_event: team,
    prospect_id: team ? null : (f('prospect').value || null) };
  const { data, error } = await supabase.from('appointments').insert(row).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.appts = [...s.appts, data].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  // Adaylı sunum planlandıysa adayı "Sunum" aşamasına yaklaştır: takip tarihini randevu gününe çek
  if (row.prospect_id) await supabase.from('prospects').update({ next_follow_up_at: row.starts_at }).eq('id', row.prospect_id);
  el.querySelector('#e-dialog').close();
  draw(); toast(team ? 'Ekip etkinliği oluşturuldu; ekip üyeleri takvimde görecek.' : 'Randevu eklendi.');
}

async function createInvite(form) {
  const err = form.querySelector('#v-error');
  const uses = Number(form.elements.namedItem('uses').value);
  if (!Number.isInteger(uses) || uses < 1 || uses > 100) { err.textContent = 'Kullanım sayısı 1-100 arası olmalı.'; return; }
  err.textContent = '';
  const { data, error } = await supabase.from('invitations').insert({ org_id: ctx.org.id, role: form.elements.namedItem('role').value, max_uses: uses }).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.invites = [data, ...s.invites];
  draw();
  try { await navigator.clipboard.writeText(inviteUrl(data.code)); toast('Davet linki oluşturuldu ve kopyalandı.'); }
  catch { toast('Davet linki oluşturuldu.'); }
}
