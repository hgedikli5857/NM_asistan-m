// Ajanda ve Takvim: Liste / Gün / Hafta / Ay görünümleri — randevular, Google Takvim, bot CRM etkinlikleri,
// takipler, görevler ve içerik planı. Hepsi aynı veriden çizilir; bir yerde eklenen her görünümde görünür.
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { KINDS, groupByDay, timeLabel, dayKey, viewRange, shiftAnchor, layoutDay, addDays, fromDay } from '../ajanda/model.js';
import { loadAgenda, prospectNames } from '../ajanda/load.js';
import { mountKart } from '../kisi/kart.js';
import { pickerHTML, bindPicker } from '../ui/picker.js';

const MODES = [{ id: 'liste', label: 'Liste', icon: 'ti-list' }, { id: 'gun', label: 'Gün', icon: 'ti-calendar-event' },
  { id: 'hafta', label: 'Hafta', icon: 'ti-calendar-week' }, { id: 'ay', label: 'Ay', icon: 'ti-calendar-month' }];
const RANGES = [{ d: 1, label: 'Bugün' }, { d: 7, label: '7 gün' }, { d: 30, label: '30 gün' }];
const WD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const APPT_KINDS = { sunum: 'Sunum', birebir: 'Birebir', etkinlik: 'Etkinlik', egitim: 'Eğitim', diger: 'Diğer' };
const PREF = 'nmd_cal_prefs';

const s = { mode: 'liste', days: 7, anchor: new Date(), startHour: 8, endHour: 22, off: new Set(), data: null, key: '', byKey: new Map(), hoursOpen: false };
let el, ctx;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || '{}');
    if (MODES.some(m => m.id === p.mode)) s.mode = p.mode;
    if (Number.isInteger(p.startHour) && Number.isInteger(p.endHour) && p.startHour >= 0 && p.endHour <= 24 && p.endHour - p.startHour >= 2) {
      s.startHour = p.startHour; s.endHour = p.endHour;
    }
  } catch { /* varsayılan */ }
}
function savePrefs() {
  try { localStorage.setItem(PREF, JSON.stringify({ mode: s.mode, startHour: s.startHour, endHour: s.endHour })); } catch { /* yok */ }
}

export async function renderAjanda(target, context) {
  el = target; ctx = context;
  loadPrefs();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (MODES.some(m => m.id === q.get('g'))) s.mode = q.get('g');
  s.anchor = new Date(); s.key = '';
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Ajanda</h1>
        <p class="muted">Randevular, Google Takvim, etkinlikler, takipler, görevler ve içerik planı tek yerde.</p></div>
      <button class="btn btn-gold" data-act="new"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Randevu ekle</button>
    </div>
    <div class="cal-top">
      <div class="seg" role="tablist" aria-label="Görünüm">${MODES.map(m =>
        `<button role="tab" data-mode="${m.id}" aria-selected="${m.id === s.mode}"><i class="ti ${m.icon}" aria-hidden="true"></i>${m.label}</button>`).join('')}</div>
      <div class="cal-nav" id="cal-nav"></div>
    </div>
    <div id="cal-hours"></div>
    <div class="chips cal-kinds" role="group" aria-label="Türler">${Object.entries(KINDS).map(([k, v]) =>
      `<button class="chip" data-kind="${k}" aria-pressed="${!s.off.has(k)}"><i class="ti ${v.icon}" aria-hidden="true"></i>${v.label}</button>`).join('')}</div>
    <div id="aj-body"><p class="muted">Yükleniyor…</p></div>
    <dialog id="aj-dialog" class="sheet" aria-labelledby="aj-dialog-title"></dialog>`;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
  await load();
  live();
}

// Canlı güncelleme: Google Takvim'den gelen ya da başka cihazda eklenen kayıtlar ekrana hemen düşer
let channel = null, liveTimer = null;
function live() {
  if (channel) supabase.removeChannel(channel);
  const page = el;
  const refresh = () => {
    if (!page.isConnected) { supabase.removeChannel(channel); channel = null; return; }
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { if (page.isConnected && !page.querySelector('#aj-dialog')?.open) load(true); }, 1200);
  };
  channel = supabase.channel('ajanda-' + ctx.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `owner_id=eq.${ctx.user.id}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refresh)
    .subscribe();
  window.addEventListener('hashchange', function off() {
    if (!location.hash.startsWith('#/ajanda')) { if (channel) supabase.removeChannel(channel); channel = null; window.removeEventListener('hashchange', off); }
  });
}

function range() {
  if (s.mode === 'liste') { const a = new Date(); a.setHours(0, 0, 0, 0); return { from: a, days: s.days }; }
  return viewRange(s.mode, s.anchor);
}

async function load(force = false) {
  const r = range();
  // Liste her zaman bugünden başlar; en az 7 gün yükle ki aralıklar arası geçiş hızlı olsun
  const days = s.mode === 'liste' ? Math.max(r.days, 7) : r.days;
  const key = `${dayKey(r.from)}:${days}`;
  if (!force && key === s.key && s.data) { draw(); return; }
  el.querySelector('#aj-body').innerHTML = '<p class="muted">Yükleniyor…</p>';
  s.data = await loadAgenda(ctx, { from: r.from, days });
  s.key = key;
  s.byKey = new Map(s.data.items.map(x => [x.key, x]));
  draw();
}

function visible() { return s.data.items.filter(x => !s.off.has(x.kind)); }

const pad = n => String(n).padStart(2, '0');

function navHTML() {
  if (s.mode === 'liste') {
    return `<div class="chips" role="group" aria-label="Zaman aralığı">${RANGES.map(r => `<button class="chip" data-range="${r.d}" aria-pressed="${r.d === s.days}">${r.label}</button>`).join('')}</div>`;
  }
  const r = range();
  const last = new Date(r.from); last.setDate(last.getDate() + r.days - 1);
  const title = s.mode === 'gun'
    ? s.anchor.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : s.mode === 'hafta'
      ? `${r.from.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : s.anchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  return `<button class="icon-btn" data-nav="-1" aria-label="Önceki"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
    <button class="btn btn-ghost sm" data-nav="0">Bugün</button>
    <button class="icon-btn" data-nav="1" aria-label="Sonraki"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    <strong class="cal-title">${esc(title.charAt(0).toLocaleUpperCase('tr') + title.slice(1))}</strong>
    ${s.mode !== 'ay' ? `<button class="btn btn-ghost sm" data-act="hours" aria-expanded="${s.hoursOpen}"><i class="ti ti-clock" aria-hidden="true"></i> ${pad(s.startHour)}:00–${pad(s.endHour)}:00</button>` : ''}`;
}

function hoursHTML() {
  if (!s.hoursOpen || s.mode === 'ay' || s.mode === 'liste') return '';
  const opt = (from, to, cur) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map(h => `<option value="${h}" ${h === cur ? 'selected' : ''}>${pad(h)}:00</option>`).join('');
  return `<div class="card cal-hours">
    <div class="field"><label for="h-start">Başlangıç</label><select id="h-start" data-hour="start">${opt(0, 22, s.startHour)}</select></div>
    <div class="field"><label for="h-end">Bitiş</label><select id="h-end" data-hour="end">${opt(2, 24, s.endHour)}</select></div>
    <p class="small muted">Gün ve hafta görünümünde gösterilen saat aralığı; bu cihazda saklanır. Aralık dışındaki randevular kenarda ok işaretiyle görünür.</p>
  </div>`;
}

function draw() {
  el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === s.mode));
  el.querySelector('#cal-nav').innerHTML = navHTML();
  el.querySelector('#cal-hours').innerHTML = hoursHTML();
  const body = el.querySelector('#aj-body');
  const tips = tipsHTML();
  if (s.mode === 'liste') body.innerHTML = tips + listHTML();
  else if (s.mode === 'ay') body.innerHTML = tips + monthHTML();
  else body.innerHTML = tips + gridHTML(s.mode === 'gun' ? 1 : 7);
  const sc = body.querySelector('.g-scroll'), now = body.querySelector('.cal-now');
  if (sc && now) sc.scrollTop = Math.max(0, now.offsetTop - sc.clientHeight / 3);
}

function tipsHTML() {
  const { warn, sources } = s.data;
  const tips = [];
  if (!sources.google) tips.push('Google Takvim\'indeki randevuların burada da güncel görünsün: <a href="#/ayarlar">Ayarlar → Google Takvim</a> kurulumunu yap.');
  if (warn.length) tips.push(`Şu kaynaklar yüklenemedi: ${esc(warn.join(', '))}. Sayfayı yenileyip tekrar dene.`);
  return tips.map(t => `<p class="note small">${t}</p>`).join('');
}

// ---------------- Liste ----------------
function listHTML() {
  const groups = groupByDay(visible(), { days: s.days });
  const { sources } = s.data;
  return `${groups.map(g => `<section class="card ajanda-day ${g.today ? 'today' : ''}">
      <h2>${esc(g.label)} <span class="small muted">${g.items.length ? g.items.length + ' kayıt' : ''}</span></h2>
      ${g.items.length ? `<ul class="ajanda-list">${g.items.map(itemRow).join('')}</ul>`
        : '<p class="muted small">Bugün için planlı bir şey yok. Bir takip ya da sunum planlamak için iyi bir gün.</p>'}
    </section>`).join('')}
    ${sources.googleAt ? `<p class="small muted">Google Takvim son eşitleme: ${esc(new Date(sources.googleAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</p>` : ''}`;
}

// Panel kartında da kullanılır (orada tıklayınca Ajanda'ya gider)
export function itemRow(it, { link = false } = {}) {
  const k = KINDS[it.kind];
  const inner = `<span class="aj-time">${esc(timeLabel(it))}</span>
    <span class="aj-icon k-${it.kind}"><i class="ti ${k.icon}" aria-hidden="true"></i></span>
    <span class="aj-main"><strong class="${it.done ? 'aj-done' : ''}">${esc(it.title)}</strong>
      ${it.late ? '<span class="badge warn">Gecikmiş</span>' : ''}${it.done ? '<span class="badge ok">Tamam</span>' : ''}
      ${it.pid ? '<span class="badge"><i class="ti ti-id-badge-2" aria-hidden="true"></i> Kart</span>' : ''}
      ${it.sub ? `<span class="small muted aj-sub">${esc(it.sub)}</span>` : ''}
      ${it.note ? `<span class="small muted aj-sub">${esc(it.note.slice(0, 140))}</span>` : ''}</span>`;
  return `<li class="aj-item">${link ? `<a class="aj-row" href="#/ajanda">${inner}</a>`
    : `<button type="button" class="aj-row" data-item="${esc(it.key)}">${inner}</button>`}</li>`;
}

// ---------------- Ay ----------------
function monthHTML() {
  const r = range();
  const items = visible();
  const today = dayKey(new Date());
  const month = s.anchor.getMonth();
  const cells = [];
  for (let i = 0; i < r.days; i++) {
    const k = addDays(dayKey(r.from), i);
    const d = fromDay(k);
    const list = items.filter(x => x.day === k);
    const MAX = 3;
    cells.push(`<div class="m-cell ${d.getMonth() !== month ? 'out' : ''} ${k === today ? 'today' : ''}" data-day="${k}" role="gridcell"
        aria-label="${esc(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }))}, ${list.length} kayıt">
      <span class="m-num">${d.getDate()}</span>
      ${list.slice(0, MAX).map(x => `<button type="button" class="m-ev k-${x.kind} ${x.done ? 'aj-done' : ''}" data-item="${esc(x.key)}">${x.allDay ? '' : `<b>${esc(timeLabel(x).split('–')[0])}</b> `}${esc(x.title)}</button>`).join('')}
      ${list.length > MAX ? `<button type="button" class="m-more" data-day-open="${k}">+${list.length - MAX} daha</button>` : ''}
    </div>`);
  }
  return `<div class="card cal-month" role="grid" aria-label="Ay görünümü">
    <div class="m-head">${WD.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="m-grid">${cells.join('')}</div>
    <p class="small muted g-hint">Bir güne dokunarak o günün saatli görünümünü aç.</p>
  </div>`;
}

// ---------------- Gün / Hafta ----------------
const HOUR_PX = 52;

function gridHTML(nDays) {
  const r = range();
  const items = visible();
  const today = dayKey(new Date());
  const hours = s.endHour - s.startHour;
  const days = Array.from({ length: nDays }, (_, i) => addDays(dayKey(r.from), i));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() - s.startHour * 60;
  const head = days.map(k => {
    const d = fromDay(k);
    return `<button type="button" class="g-dayhead ${k === today ? 'today' : ''}" data-day-open="${k}">
      <span>${WD[(d.getDay() + 6) % 7]}</span><b>${d.getDate()}</b></button>`;
  }).join('');
  const hasAllDay = items.some(x => x.allDay && days.includes(x.day));
  const maxAll = nDays === 1 ? 8 : 3;
  const allDay = days.map(k => {
    const list = items.filter(x => x.day === k && x.allDay);
    return `<div class="g-allday-cell">${list.slice(0, maxAll).map(x =>
      `<button type="button" class="g-chip k-${x.kind}" data-item="${esc(x.key)}">${esc(x.title)}</button>`).join('')}
      ${list.length > maxAll ? `<button type="button" class="m-more" data-day-open="${k}">+${list.length - maxAll}</button>` : ''}</div>`;
  }).join('');
  const cols = days.map(k => {
    const evs = layoutDay(items.filter(x => x.day === k), { startHour: s.startHour, endHour: s.endHour });
    return `<div class="g-col ${k === today ? 'today' : ''}" data-col="${k}" style="height:${hours * HOUR_PX}px">
      ${evs.map(g => {
        const top = g.top / 60 * HOUR_PX, h = Math.max(g.height / 60 * HOUR_PX, 20), w = 100 / g.cols;
        return `<button type="button" class="g-ev k-${g.it.kind} ${g.it.done ? 'aj-done' : ''}" data-item="${esc(g.it.key)}"
          style="top:${top}px;height:${h}px;left:calc(${g.col * w}% + 2px);width:calc(${w}% - 4px)">${g.before ? '<i class="ti ti-arrow-up" aria-label="Aralıktan önce"></i>' : ''}${g.after ? '<i class="ti ti-arrow-down" aria-label="Aralıktan sonra"></i>' : ''}<b>${esc(timeLabel(g.it))}</b> <span>${esc(g.it.title)}</span></button>`;
      }).join('')}
      ${k === today && nowMin >= 0 && nowMin <= hours * 60 ? `<div class="cal-now" style="top:${nowMin / 60 * HOUR_PX}px"></div>` : ''}
    </div>`;
  }).join('');
  const axis = Array.from({ length: hours }, (_, i) => `<span style="height:${HOUR_PX}px">${pad(s.startHour + i)}:00</span>`).join('');
  return `<div class="card cal-grid ${nDays === 1 ? 'one' : 'week'}" style="--days:${nDays}">
    <div class="g-row g-head"><span class="g-axis-sp"></span>${head}</div>
    ${hasAllDay ? `<div class="g-row g-allday"><span class="g-axis-sp small muted">Gün boyu</span>${allDay}</div>` : ''}
    <div class="g-scroll"><div class="g-row g-body"><div class="g-axis">${axis}</div>${cols}</div></div>
    <p class="small muted g-hint">Boş bir saate dokunarak o saate randevu ekle.</p>
  </div>`;
}

// ---------------- Ayrıntı ----------------
function openItem(key) {
  const it = s.byKey.get(key);
  if (!it) return;
  const d = el.querySelector('#aj-dialog');
  const k = KINDS[it.kind];
  const when = `${fromDay(it.day).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${timeLabel(it)}`;
  const people = it.people || [];
  d.innerHTML = `<header class="sheet-head"><div><span class="badge"><i class="ti ${k.icon}" aria-hidden="true"></i> ${esc(k.label)}</span>
      <h2 id="aj-dialog-title" style="margin:6px 0 0">${esc(it.title)}</h2></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <p><i class="ti ti-clock" aria-hidden="true"></i> ${esc(when)}</p>
      ${it.sub ? `<p class="muted">${esc(it.sub)}</p>` : ''}
      ${it.note ? `<p class="pre">${esc(it.note)}</p>` : ''}
      ${it.link ? `<p><a href="${esc(it.link)}" target="_blank" rel="noopener"><i class="ti ti-link" aria-hidden="true"></i> Katılım bağlantısı</a></p>` : ''}
      <div class="quick">
        ${it.kind === 'randevu' && it.status === 'planli' ? `<button class="btn btn-primary" data-act="appt-done" data-id="${esc(it.ref)}"><i class="ti ti-check" aria-hidden="true"></i> Yapıldı</button>
          <button class="btn btn-ghost" data-act="appt-noshow" data-id="${esc(it.ref)}">Gelmedi</button>
          <button class="btn btn-ghost" data-act="appt-cancel" data-id="${esc(it.ref)}">İptal et</button>` : ''}
        ${it.pid ? `<a class="btn btn-ghost" href="#/kazanim?aday=${esc(it.pid)}"><i class="ti ti-user" aria-hidden="true"></i> Adayı aç</a>
          <a class="btn btn-ghost" href="#/iletisim?aday=${esc(it.pid)}"><i class="ti ti-message-2" aria-hidden="true"></i> Mesaj yaz</a>` : ''}
        ${it.kind === 'icerik' && !it.done ? `<a class="btn btn-gold" href="#/pazarlama?uret=${esc(it.ref)}"><i class="ti ti-player-play" aria-hidden="true"></i> Oluştur</a>` : ''}
        ${it.kind === 'icerik' ? `<a class="btn btn-ghost" href="#/pazarlama">İçerik takvimi</a>` : ''}
        ${it.kind === 'takip' ? '<a class="btn btn-ghost" href="#/iletisim">İletişim → Bugün</a>' : ''}
      </div>
      ${people.length ? `<h3>Kişiler</h3><div class="chips">${people.map(p => `<button class="chip" data-person="${esc(p.id)}">${esc(p.name)}${p.late ? ' · gecikmiş' : ''}</button>`).join('')}</div>` : ''}
      ${it.kind === 'google' && !it.pid ? '<p class="small muted">Başlıkta adayın tam adı soyadı geçerse bu etkinlik o kişinin kartına bağlanır.</p>' : ''}
      <div id="aj-kart"></div>
    </div>`;
  if (!d.open) d.showModal();
  if (it.pid) showPerson(it.pid);
}

async function showPerson(id) {
  const box = el.querySelector('#aj-kart');
  if (!box) return;
  box.innerHTML = '<p class="muted small">Kart yükleniyor…</p>';
  const { data: p, error } = await supabase.from('prospects').select('*').eq('id', id).maybeSingle();
  if (error || !p) { box.innerHTML = '<p class="muted small">Kişi kaydı bulunamadı.</p>'; return; }
  box.innerHTML = `<h3 style="margin-top:14px">${esc(p.full_name)}</h3><div></div>`;
  mountKart(box.lastElementChild, p);
}

// ---------------- Yeni randevu ----------------
async function newAppt(day = null, minutes = null) {
  const d = el.querySelector('#aj-dialog');
  const base = day ? fromDay(day) : new Date(Date.now() + 864e5);
  if (minutes !== null) base.setHours(0, minutes, 0, 0);
  else base.setHours(Math.max(s.startHour, Math.min(20, s.endHour - 1)), 0, 0, 0);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const prospects = await prospectNames(ctx).catch(() => []);
  d.innerHTML = `<form data-form="appt" novalidate>
    <header class="sheet-head"><h2 id="aj-dialog-title">Yeni randevu</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <div class="field"><label for="n-title">Başlık *</label><input id="n-title" name="title" maxlength="160" placeholder="Ör. Ayşe ile sunum"></div>
      <div class="form-2">
        <div class="field"><label for="n-kind">Tür</label><select id="n-kind" name="kind">${Object.entries(APPT_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label for="n-when">Tarih ve saat *</label><input id="n-when" name="when" type="datetime-local" value="${local}"></div>
      </div>
      <div class="form-2">
        <div class="field"><label for="n-dur">Süre (dk)</label><input id="n-dur" name="duration" type="number" min="5" max="1440" value="45"></div>
        <div class="field">${pickerHTML({ id: 'n-pick', label: 'Aday (isteğe bağlı)', prospects, name: 'prospect' })}</div>
      </div>
      <div class="field"><label for="n-loc">Yer ya da bağlantı</label><input id="n-loc" name="location" placeholder="Ör. Zoom linki veya adres"></div>
      <div class="field"><label for="n-notes">Not</label><textarea id="n-notes" name="notes" rows="2"></textarea></div>
      <p class="small muted">Google Takvim bağlıysa randevu 1 dakika içinde "NM Departmanı" takvimine de düşer.</p>
      <p class="error" id="n-error" role="alert"></p>
    </div>
    <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button class="btn btn-primary" type="submit">Kaydet</button></footer></form>`;
  if (!d.open) d.showModal();
  bindPicker(d, { id: 'n-pick', prospects });
  d.querySelector('#n-title').focus();
}

async function saveAppt(form) {
  const err = form.querySelector('#n-error');
  const f = n => form.elements[n];
  const title = f('title').value.trim(), when = f('when').value, duration = Number(f('duration').value);
  if (!title) { err.textContent = 'Başlık zorunlu.'; return; }
  if (!when || isNaN(new Date(when))) { err.textContent = 'Tarih ve saat seç.'; return; }
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) { err.textContent = 'Süre 5-1440 dakika olmalı.'; return; }
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  const row = { org_id: ctx.org.id, title, kind: f('kind').value, starts_at: new Date(when).toISOString(), duration_min: duration,
    location: f('location').value.trim() || null, notes: f('notes').value.trim() || null, is_team_event: false,
    prospect_id: f('prospect')?.value || null };
  const { error } = await supabase.from('appointments').insert(row);
  if (error) { err.textContent = trError(error); btn.disabled = false; return; }
  if (row.prospect_id) await supabase.from('prospects').update({ next_follow_up_at: row.starts_at }).eq('id', row.prospect_id);
  el.querySelector('#aj-dialog').close();
  toast('Randevu eklendi.');
  await load(true);
}

async function setApptStatus(id, status) {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) { toast(trError(error)); return; }
  el.querySelector('#aj-dialog').close();
  toast({ yapildi: 'Randevu yapıldı olarak işaretlendi.', gelmedi: 'Gelmedi olarak işaretlendi; bir takip planlamayı unutma.', iptal: 'Randevu iptal edildi.' }[status]);
  await load(true);
}

// ---------------- Olaylar ----------------
function onClick(e) {
  const t = e.target;
  const mode = t.closest('[data-mode]');
  if (mode) {
    s.mode = mode.dataset.mode; savePrefs();
    history.replaceState(null, '', `#/ajanda?g=${s.mode}`);
    load(); return;
  }
  const nav = t.closest('[data-nav]');
  if (nav) { const dir = +nav.dataset.nav; s.anchor = dir === 0 ? new Date() : shiftAnchor(s.mode, s.anchor, dir); load(); return; }
  const rg = t.closest('[data-range]');
  if (rg) { s.days = +rg.dataset.range; load(); return; }
  const kd = t.closest('[data-kind]');
  if (kd) {
    const id = kd.dataset.kind;
    s.off.has(id) ? s.off.delete(id) : s.off.add(id);
    kd.setAttribute('aria-pressed', !s.off.has(id));
    draw(); return;
  }
  const item = t.closest('[data-item]');
  if (item) { openItem(item.dataset.item); return; }
  const person = t.closest('[data-person]');
  if (person) { showPerson(person.dataset.person); return; }
  const dayOpen = t.closest('[data-day-open]');
  if (dayOpen) { s.anchor = fromDay(dayOpen.dataset.dayOpen); s.mode = 'gun'; savePrefs(); load(); return; }
  const cell = t.closest('.m-cell');
  if (cell) { s.anchor = fromDay(cell.dataset.day); s.mode = 'gun'; savePrefs(); load(); return; }
  const col = t.closest('.g-col');
  if (col && t === col) {
    const y = e.clientY - col.getBoundingClientRect().top;
    const min = s.startHour * 60 + Math.floor((y / HOUR_PX) * 2) * 30;
    newAppt(col.dataset.col, Math.min(min, 23 * 60 + 30)); return;
  }
  const b = t.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'new': newAppt(s.mode === 'liste' ? null : dayKey(s.anchor)); break;
    case 'close': el.querySelector('#aj-dialog').close(); break;
    case 'hours': s.hoursOpen = !s.hoursOpen; draw(); break;
    case 'appt-done': setApptStatus(b.dataset.id, 'yapildi'); break;
    case 'appt-noshow': setApptStatus(b.dataset.id, 'gelmedi'); break;
    case 'appt-cancel': if (confirm('Randevu iptal edilsin mi?')) setApptStatus(b.dataset.id, 'iptal'); break;
  }
}

function onChange(e) {
  const h = e.target.closest('[data-hour]');
  if (!h) return;
  const v = +h.value;
  if (h.dataset.hour === 'start') s.startHour = Math.min(v, s.endHour - 2);
  else s.endHour = Math.max(v, s.startHour + 2);
  savePrefs(); draw();
}

function onSubmit(e) {
  const form = e.target;
  if (form.dataset.form !== 'appt') return; // kişi kartı formu kendi işini görür
  e.preventDefault();
  saveAppt(form);
}
