// Ajanda: bugün ve önümüzdeki günler — randevular, Google Takvim, bot CRM etkinlikleri, takipler, görevler, içerik planı
import { esc, todayLong } from '../ui.js';
import { KINDS, groupByDay, timeLabel } from '../ajanda/model.js';
import { loadAgenda } from '../ajanda/load.js';

const RANGES = [{ d: 1, label: 'Bugün' }, { d: 7, label: '7 gün' }, { d: 30, label: '30 gün' }];
const s = { days: 7, off: new Set(), data: null, loaded: 0 };
let el, ctx;

export async function renderAjanda(target, context) {
  el = target; ctx = context;
  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(todayLong())}</div><h1>Ajanda</h1>
        <p class="muted">Randevular, Google Takvim, etkinlikler, takipler, görevler ve içerik planı tek yerde.</p></div>
      <a class="btn btn-gold" href="#/ekip?tab=takvim"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Randevu ekle</a>
    </div>
    <div class="toolbar ajanda-bar">
      <div class="chips" role="group" aria-label="Zaman aralığı">${RANGES.map(r => `<button class="chip" data-range="${r.d}" aria-pressed="${r.d === s.days}">${r.label}</button>`).join('')}</div>
      <div class="chips" role="group" aria-label="Türler">${Object.entries(KINDS).map(([k, v]) =>
        `<button class="chip" data-kind="${k}" aria-pressed="${!s.off.has(k)}"><i class="ti ${v.icon}" aria-hidden="true"></i>${v.label}</button>`).join('')}</div>
    </div>
    <div id="aj-body"><p class="muted">Yükleniyor…</p></div>`;
  el.addEventListener('click', onClick);
  await load();
}

async function load() {
  el.querySelector('#aj-body').innerHTML = '<p class="muted">Yükleniyor…</p>';
  s.loaded = Math.max(s.days, 7);
  s.data = await loadAgenda(ctx, { days: s.loaded });
  draw();
}

function draw() {
  const { items, warn, sources } = s.data;
  const shown = items.filter(x => !s.off.has(x.kind));
  const groups = groupByDay(shown, { days: s.days });
  const total = shown.length;
  const tips = [];
  if (!sources.google) tips.push('Google Takvim\'indeki randevuların burada da görünsün: <a href="#/ayarlar">Ayarlar → Google Takvim</a> kurulumunu yap.');
  if (warn.length) tips.push(`Şu kaynaklar yüklenemedi: ${esc(warn.join(', '))}. Sayfayı yenileyip tekrar dene.`);
  el.querySelector('#aj-body').innerHTML = `
    ${tips.map(t => `<p class="note small">${t}</p>`).join('')}
    ${groups.map(g => `<section class="card ajanda-day ${g.today ? 'today' : ''}">
      <h2>${esc(g.label)} <span class="small muted">${g.items.length ? g.items.length + ' kayıt' : ''}</span></h2>
      ${g.items.length ? `<ul class="ajanda-list">${g.items.map(itemRow).join('')}</ul>`
        : '<p class="muted small">Bugün için planlı bir şey yok. Bir takip ya da sunum planlamak için iyi bir gün.</p>'}
    </section>`).join('')}
    ${!total && s.days > 1 ? '<p class="muted small">Bu aralıkta kayıt yok.</p>' : ''}
    ${sources.googleAt ? `<p class="small muted">Google Takvim son eşitleme: ${esc(new Date(sources.googleAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</p>` : ''}`;
}

export function itemRow(it) {
  const k = KINDS[it.kind];
  const inner = `<span class="aj-time">${esc(timeLabel(it))}</span>
    <span class="aj-icon k-${it.kind}"><i class="ti ${k.icon}" aria-hidden="true"></i></span>
    <span class="aj-main"><strong class="${it.done ? 'aj-done' : ''}">${esc(it.title)}</strong>
      ${it.late ? '<span class="badge warn">Gecikmiş</span>' : ''}${it.done ? '<span class="badge ok">Tamam</span>' : ''}
      ${it.sub ? `<span class="small muted aj-sub">${esc(it.sub)}</span>` : ''}
      ${it.note ? `<span class="small muted aj-sub">${esc(it.note.slice(0, 140))}</span>` : ''}
      ${it.link ? `<a class="small" href="${esc(it.link)}" target="_blank" rel="noopener">Katılım bağlantısı</a>` : ''}</span>`;
  return `<li class="aj-item">${it.href ? `<a class="aj-row" href="${esc(it.href)}">${inner}</a>` : `<div class="aj-row">${inner}</div>`}</li>`;
}

function onClick(e) {
  const r = e.target.closest('[data-range]');
  if (r) {
    s.days = +r.dataset.range;
    el.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', b === r));
    if (s.days > s.loaded) load(); else draw();
    return;
  }
  const k = e.target.closest('[data-kind]');
  if (k) {
    const id = k.dataset.kind;
    s.off.has(id) ? s.off.delete(id) : s.off.add(id);
    k.setAttribute('aria-pressed', !s.off.has(id));
    draw();
  }
}
