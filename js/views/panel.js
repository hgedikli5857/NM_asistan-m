// Ana panel: selamlama, günlük sayılar ve 6 birimin kartları
import { supabase } from '../supabase.js';
import { UNITS } from '../units.js';
import { esc, greeting, todayLong, todayISO } from '../ui.js';
import { loadAgenda } from '../ajanda/load.js';
import { nextUp, timeLabel } from '../ajanda/model.js';
import { itemRow } from './ajanda.js';

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
    <section class="card" id="upcoming" style="margin-top:16px"><h2><i class="ti ti-calendar-time" aria-hidden="true"></i> Bugünün ajandası</h2>
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
  try {
    const { items } = await loadAgenda(ctx, { days: 7 });
    const now = new Date();
    const today = items.filter(x => x.day === dayStr(now));
    const next = today.length ? null : nextUp(items, now);
    box.innerHTML = `<div class="card-head"><h2><i class="ti ti-calendar-time" aria-hidden="true"></i> Bugünün ajandası</h2>
        <a class="btn btn-ghost sm" href="#/ajanda">Ajandayı aç <i class="ti ti-arrow-right" aria-hidden="true"></i></a></div>
      ${today.filter(x => x.kind === 'icerik' && !x.done).map(x => `<div class="today-make"><span><i class="ti ti-photo" aria-hidden="true"></i> Bugünün içeriği: <strong>${esc(x.title)}</strong></span>
        <a class="btn btn-gold sm" href="#/pazarlama?uret=${esc(x.ref)}"><i class="ti ti-player-play" aria-hidden="true"></i> Oluştur</a></div>`).join('')}
      ${today.length ? `<ul class="ajanda-list">${today.slice(0, 8).map(x => itemRow(x, { link: true })).join('')}</ul>
          ${today.length > 8 ? `<p class="small muted">+${today.length - 8} kayıt daha — <a href="#/ajanda">tümü</a></p>` : ''}`
        : `<p class="muted small">Bugün için planlı bir şey yok.${next ? '' : ' <a href="#/ekip?tab=takvim">Bir sunum planla</a>.'}</p>
           ${next ? `<p class="small"><strong>Sıradaki:</strong> ${esc(next.title)} · ${esc(new Date(next.start).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'short' }))} ${esc(timeLabel(next))}</p>` : ''}`}`;
  } catch {
    box.innerHTML = '<h2>Bugünün ajandası</h2><p class="muted small">Ajanda yüklenemedi. <a href="#/ajanda">Ajandayı aç</a></p>';
  }
}

const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
