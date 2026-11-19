// Ana panel: selamlama, günlük sayılar ve 6 birimin kartları
import { supabase } from '../supabase.js';
import { UNITS } from '../units.js';
import { esc, greeting, todayLong, todayISO } from '../ui.js';

const MOTTOS = [
  'Küçük ama istikrarlı adımlar.',
  'Birlikte büyü.',
  'Sonucu değil, bugünkü aktiviteyi kontrol edersin.',
  'Bir takip mesajı, kaybolan bir adayı geri getirir.',
  'Liste büyürse iş büyür.'
];

export async function renderPanel(el, ctx) {
  const name = (ctx.profile?.full_name || '').split(' ')[0] || 'Lider';
  const motto = MOTTOS[new Date().getDate() % MOTTOS.length];

  el.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(todayLong())}</div>
        <h1>${esc(greeting())}, ${esc(name)}</h1>
        <p class="muted">${esc(ctx.org?.name || '')} · operasyon merkezi</p>
      </div>
      <a class="btn btn-gold" href="#/kazanim"><i class="ti ti-user-plus" aria-hidden="true"></i> Aday ekle</a>
    </div>

    <p class="motto">${esc(motto)}</p>

    <section aria-label="Bugünün özeti" class="grid grid-stats" id="stats">
      ${statCard('Toplam aday', '–', 'Kazanım birimindeki kayıtlar')}
      ${statCard('Bugünkü görevler', '–', 'Tamamlanan / toplam')}
      ${statCard('Bugün takip', '–', 'Bugün ve gecikmiş takipler')}
      ${statCard('Bu hafta yeni', '–', 'Son 7 günde eklenen aday')}
    </section>

    <div id="guide"></div>
    <section class="card" id="upcoming" style="margin-top:16px"><h2><i class="ti ti-calendar-event" aria-hidden="true"></i> Yaklaşan randevular</h2>
      <p class="muted small">Yükleniyor…</p></section>

    <div class="section-title"><h2>Departman birimleri</h2><span class="small muted">6 birim aktif</span></div>
    <section class="grid grid-units" aria-label="Birimler">
      ${UNITS.map(u => `
        <a class="card unit ${u.group === 'grow' ? 'grow' : ''}" href="#/${u.id}">
          <div class="icon"><i class="ti ${u.icon}" aria-hidden="true"></i></div>
          <h3>${esc(u.title)}</h3>
          <p>${esc(u.summary)}</p>

        </a>`).join('')}
    </section>`;

  loadStats(el.querySelector('#stats'));
  loadGuide(el.querySelector('#guide'), ctx);
  loadUpcoming(el.querySelector('#upcoming'), ctx);
}

const GUIDE_HIDE = 'nmd_guide_hidden';

// İlk kullanım rehberi: 5 adım tamamlanınca ya da gizlenince kaybolur
async function loadGuide(box, ctx) {
  if (localStorage.getItem(GUIDE_HIDE) === ctx.user.id) return;
  const head = q => q.then(r => r.count || 0);
  const [prospects, contacts, targets, lessons, invites] = await Promise.all([
    head(supabase.from('prospects').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
    head(supabase.from('interactions').select('id', { count: 'exact', head: true })),
    head(supabase.from('kpi_targets').select('user_id', { count: 'exact', head: true })),
    head(supabase.from('academy_progress').select('item_id', { count: 'exact', head: true }).eq('kind', 'ders')),
    ['owner', 'leader'].includes(ctx.membership?.role)
      ? head(supabase.from('invitations').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id)) : Promise.resolve(1)
  ]);
  const steps = [
    { done: targets > 0, text: 'Hedeflerini belirle', href: '#/olcum' },
    { done: prospects >= 20, text: `Sıcak listene 20 kişi ekle (${Math.min(prospects, 20)}/20)`, href: '#/kazanim' },
    { done: contacts > 0, text: 'İlk temasını kaydet', href: '#/iletisim' },
    { done: lessons > 0, text: 'Akademi\'de ilk dersi bitir', href: '#/akademi?tab=program' },
    { done: invites > 0, text: 'Ekibin için bir davet linki oluştur', href: '#/ekip?tab=davet' }
  ];
  const done = steps.filter(x => x.done).length;
  if (done === steps.length) return;
  box.innerHTML = `<section class="card guide" style="margin-top:16px">
    <header><h2><i class="ti ti-map-2" aria-hidden="true"></i> Başlangıç rehberi · ${done}/${steps.length}</h2>
      <button class="link-btn" id="guide-hide">Gizle</button></header>
    <div class="meter"><span style="width:${Math.round((done / steps.length) * 100)}%"></span></div>
    <ol class="guide-steps">${steps.map(x => `<li class="${x.done ? 'done' : ''}"><a href="${x.href}">
      <i class="ti ${x.done ? 'ti-circle-check' : 'ti-circle'}" aria-hidden="true"></i>${esc(x.text)}</a></li>`).join('')}</ol></section>`;
  box.querySelector('#guide-hide').addEventListener('click', () => { localStorage.setItem(GUIDE_HIDE, ctx.user.id); box.innerHTML = ''; });
}

async function loadUpcoming(box, ctx) {
  const { data, error } = await supabase.from('appointments').select('id, title, kind, starts_at, is_team_event, org_id, owner_id')
    .gte('starts_at', new Date(Date.now() - 2 * 3600e3).toISOString()).eq('status', 'planli').order('starts_at').limit(20);
  if (error) { box.querySelector('p').textContent = 'Randevular yüklenemedi.'; return; }
  const list = data.filter(a => a.owner_id === ctx.user.id || a.org_id === ctx.org.id).slice(0, 4);
  box.innerHTML = `<h2><i class="ti ti-calendar-event" aria-hidden="true"></i> Yaklaşan randevular</h2>
    ${list.length ? `<ul class="entry-list">${list.map(a => `<li><span><strong>${esc(a.title)}</strong>
      ${a.is_team_event ? '<span class="badge gold">Ekip</span>' : ''}</span>
      <span class="small muted">${esc(new Date(a.starts_at).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></li>`).join('')}</ul>`
      : '<p class="muted small">Planlı randevu yok. <a href="#/ekip?tab=takvim">Bir sunum planla</a>.</p>'}`;
}

function statCard(label, value, hint) {
  return `<div class="card stat"><div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;
}

async function loadStats(box) {
  const today = todayISO();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

  const count = q => q.then(r => (r.error ? null : r.count));
  const base = () => supabase.from('prospects').select('id', { count: 'exact', head: true }).is('deleted_at', null);

  const [total, tasksAll, tasksDone, follow, fresh] = await Promise.all([
    count(base()),
    count(supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('due_date', today)),
    count(supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('due_date', today).not('done_at', 'is', null)),
    count(base().lte('next_follow_up_at', endOfDay.toISOString())),
    count(base().gte('created_at', weekAgo))
  ]);

  const show = v => (v === null ? '!' : v);
  const values = [show(total), `${show(tasksDone)} / ${show(tasksAll)}`, show(follow), show(fresh)];
  box.querySelectorAll('.value').forEach((node, i) => { node.textContent = values[i]; });
}
