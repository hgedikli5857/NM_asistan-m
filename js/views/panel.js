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

    <div class="section-title"><h2>Departman birimleri</h2><span class="small muted">Faz 1 tamam</span></div>
    <section class="grid grid-units" aria-label="Birimler">
      ${UNITS.map(u => `
        <a class="card unit ${u.group === 'grow' ? 'grow' : ''}" href="#/${u.id}">
          <div class="icon"><i class="ti ${u.icon}" aria-hidden="true"></i></div>
          <h3>${esc(u.title)}</h3>
          <p>${esc(u.summary)}</p>
          <div>${u.live ? '<span class="badge ok">Aktif</span>'
            : `<span class="badge ${u.phase === 1 ? 'gold' : ''}">Faz ${u.phase}'de açılıyor</span>`}</div>
        </a>`).join('')}
    </section>`;

  loadStats(el.querySelector('#stats'));
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
