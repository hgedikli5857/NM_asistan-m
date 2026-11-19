// Ölçüm ve uyum birimi: göstergeler, haftalık hesap verme, gelir takibi, KVKK uyumu
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import {
  dailyMetrics, sumRange, keysBetween, lastDays, weekStart, monthStart, dayKey,
  activeStreak, pct, formatTL, weekSummary
} from '../olcum/metrics.js';
import { ACTIVE_STAGES } from '../kazanim/model.js';

const TABS = [
  { id: 'kpi', label: 'Göstergeler', icon: 'ti-chart-bar' },
  { id: 'hafta', label: 'Hesap verme', icon: 'ti-calendar-check' },
  { id: 'gelir', label: 'Gelir', icon: 'ti-coin' },
  { id: 'uyum', label: 'Uyum', icon: 'ti-shield-check' }
];
const DEFAULT_TARGETS = { daily_contacts: 5, daily_followups: 5, weekly_invites: 10, weekly_presentations: 3, monthly_income: 50000 };
const INCOME_SOURCES = ['Prim / bonus', 'Perakende kâr', 'Diğer'];

let el, ctx;
let s = { tab: 'kpi' };

export async function renderOlcum(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  if (TABS.some(t => t.id === tab)) s.tab = tab;

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Ekip ve sistem</div><h1>Ölçüm ve uyum</h1>
        <p class="muted">Sonucu değil, bugünkü aktiviteyi kontrol edersin.</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="Ölçüm sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="o-body"><div class="card empty"><p class="muted">Yükleniyor…</p></div></div>
    <dialog id="o-dialog" class="sheet" aria-labelledby="o-dialog-title"></dialog>`;

  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  await load();
}

async function load() {
  const since = d => new Date(Date.now() - d * 864e5).toISOString();
  const [inter, events, prospects, consents, targets, reviews, income] = await Promise.all([
    supabase.from('interactions').select('prospect_id, kind, occurred_at').gte('occurred_at', since(365)).limit(10000),
    supabase.from('stage_events').select('prospect_id, from_stage, to_stage, occurred_at').gte('occurred_at', since(120)).limit(10000),
    supabase.from('prospects').select('id, full_name, stage, created_at, deleted_at').limit(5000),
    supabase.from('consents').select('prospect_id, kind, granted').limit(10000),
    supabase.from('kpi_targets').select('*').eq('org_id', ctx.org.id).maybeSingle(),
    supabase.from('weekly_reviews').select('*').order('week_start', { ascending: false }).limit(12),
    supabase.from('income_entries').select('*').gte('month', dayKey(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1))).order('month', { ascending: false })
  ]);
  for (const r of [inter, events, prospects, consents, targets, reviews, income]) if (r.error) throw r.error;

  const alive = prospects.data.filter(p => !p.deleted_at);
  s.interactions = inter.data;
  s.events = events.data;
  s.prospects = alive;
  s.deleted = prospects.data.filter(p => p.deleted_at);
  s.consents = consents.data;
  s.targets = { ...DEFAULT_TARGETS, ...(targets.data || {}) };
  s.reviews = reviews.data;
  s.income = income.data;
  s.days = dailyMetrics({ interactions: s.interactions, stageEvents: s.events, prospects: alive });
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  const body = el.querySelector('#o-body');
  body.innerHTML = { kpi: viewKpi, hafta: viewWeek, gelir: viewIncome, uyum: viewCompliance }[s.tab]();
}

// ====================================================================
// Göstergeler
function viewKpi() {
  const t = s.targets;
  const today = s.days[dayKey(new Date())] || {};
  const week = sumRange(s.days, keysBetween(weekStart()));
  const month = sumRange(s.days, keysBetween(monthStart()));
  const streak = activeStreak(s.days);
  const keys14 = lastDays(14);
  const max = Math.max(1, ...keys14.map(k => { const d = s.days[k] || {}; return (d.yeniTemas || 0) + (d.takip || 0) + (d.sunum || 0); }));

  return `
    <div class="kpi-head">
      <span class="badge ${streak ? 'gold' : ''}"><i class="ti ti-flame" aria-hidden="true"></i> ${streak} gün art arda aktif</span>
      <button class="btn btn-ghost" data-act="targets"><i class="ti ti-target" aria-hidden="true"></i> Hedefleri düzenle</button>
    </div>
    <div class="grid grid-stats">
      ${meter('Bugün yeni temas', today.yeniTemas || 0, t.daily_contacts, 'günlük hedef')}
      ${meter('Bugün takip', today.takip || 0, t.daily_followups, 'günlük hedef')}
      ${meter('Bu hafta davet', week.davet, t.weekly_invites, 'haftalık hedef')}
      ${meter('Bu hafta sunum', week.sunum, t.weekly_presentations, 'haftalık hedef')}
    </div>

    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-chart-bar" aria-hidden="true"></i> Son 14 gün aktivite</h2>
      <div class="bars" role="img" aria-label="Son 14 günün günlük aktivite sayıları">
        ${keys14.map(k => {
          const d = s.days[k] || {};
          const n = (d.yeniTemas || 0) + (d.takip || 0) + (d.sunum || 0);
          const day = new Date(k + 'T12:00:00');
          return `<div class="bar-col" title="${esc(day.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))}: ${n}">
            <span class="bar-val">${n || ''}</span>
            <span class="bar" style="height:${Math.round((n / max) * 100)}%"></span>
            <span class="bar-lbl">${day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span></div>`;
        }).join('')}
      </div>
      <p class="small muted">Yeni temas + takip + sunum. Boş günler zinciri koparır.</p>
    </section>

    <section class="card" style="margin-top:16px">
      <h2><i class="ti ti-filter" aria-hidden="true"></i> Bu ay huni</h2>
      <div class="conv">
        ${convStep('Yeni aday', month.yeniAday)}
        ${convStep('Yeni temas', month.yeniTemas)}
        ${convStep('Davet', month.davet)}
        ${convStep('Sunum', month.sunum)}
        ${convStep('Müşteri / iş ortağı', month.kazanilan)}
      </div>
      <p class="small muted">${month.davet ? `Davetlerin %${Math.round((month.sunum / month.davet) * 100)}'i sunuma dönüştü.` : 'Bu ay henüz davet yok. Davet sayısı, sunumun öncü göstergesidir.'}</p>
    </section>`;
}

function meter(label, value, target, hint) {
  const p = pct(value, target);
  return `<div class="card stat">
    <div class="label">${esc(label)}</div>
    <div class="value">${value}<span class="of"> / ${target}</span></div>
    <div class="meter" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><span style="width:${p}%" class="${p >= 100 ? 'done' : ''}"></span></div>
    <div class="hint">${p >= 100 ? 'Hedef tamam' : esc(hint)}</div></div>`;
}
const convStep = (label, n) => `<div class="conv-step"><strong>${n}</strong><span>${esc(label)}</span></div>`;

function targetsDialog() {
  const t = s.targets;
  const num = (name, label, val, step = 1) => `<div class="field"><label for="g-${name}">${label}</label>
    <input id="g-${name}" name="${name}" type="number" inputmode="numeric" min="0" step="${step}" value="${val}"></div>`;
  const d = el.querySelector('#o-dialog');
  d.innerHTML = `<form data-form="targets" novalidate>
    <header class="sheet-head"><h2 id="o-dialog-title">Hedeflerim</h2>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body">
      <p class="small muted">Gerçekçi başla. Hedefi tutturmak, büyük hedefi kaçırmaktan daha çok motive eder.</p>
      <div class="form-2">${num('daily_contacts', 'Günlük yeni temas', t.daily_contacts)}${num('daily_followups', 'Günlük takip', t.daily_followups)}</div>
      <div class="form-2">${num('weekly_invites', 'Haftalık davet', t.weekly_invites)}${num('weekly_presentations', 'Haftalık sunum', t.weekly_presentations)}</div>
      ${num('monthly_income', 'Aylık gelir hedefi (TL)', Number(t.monthly_income), 500)}
      <p class="error" id="g-error" role="alert"></p>
    </div>
    <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-act="close">Vazgeç</button>
      <button type="submit" class="btn btn-primary">Kaydet</button></footer></form>`;
  d.showModal();
}

// ====================================================================
// Haftalık hesap verme
function viewWeek() {
  const ws = dayKey(weekStart());
  const current = s.reviews.find(r => r.week_start === ws) || {};
  const total = sumRange(s.days, keysBetween(weekStart()));
  const prev = s.reviews.find(r => r.week_start < ws);
  const actions = [...(current.actions || []), '', '', ''].slice(0, 3);
  const end = new Date(weekStart()); end.setDate(end.getDate() + 6);
  const range = `${weekStart().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`;

  return `
  <div class="compose">
    <form class="card" data-form="review" novalidate>
      <h2><i class="ti ti-calendar-check" aria-hidden="true"></i> Haftalık takip · ${esc(range)}</h2>
      <div class="auto-sum"><span class="small muted">Sistemin saydığı:</span> ${esc(weekSummary(total, s.targets))}</div>
      <div class="field"><label for="w-plan">Bu hafta hedefim neydi?</label>
        <textarea id="w-plan" name="planned" rows="2" placeholder="${esc(prev?.actions?.filter(Boolean).join(' · ') || 'Ör. 25 yeni temas, 3 sunum')}">${esc(current.planned)}</textarea></div>
      <div class="field"><label for="w-actual">Gerçekleşen ne oldu?</label>
        <textarea id="w-actual" name="actual" rows="2">${esc(current.actual || '')}</textarea>
        <button type="button" class="link-btn" data-act="fill-actual">Sistemin saydığını yaz</button></div>
      <div class="field"><label for="w-gap">Fark neden oluştu?</label>
        <textarea id="w-gap" name="gap_reason" rows="2" placeholder="Dürüst ol: zaman, korku, plansızlık…">${esc(current.gap_reason)}</textarea></div>
      <fieldset class="field"><legend>Önümüzdeki hafta için 3 spesifik eylem</legend>
        ${actions.map((a, i) => `<input name="action${i}" value="${esc(a)}" placeholder="${['Ör. Her gün 5 yeni kişiye mesaj', 'Ör. Perşembe online sunum', 'Ör. 3 sıcak adayla takip'][i]}" aria-label="Eylem ${i + 1}">`).join('')}
      </fieldset>
      <fieldset class="field"><legend>Haftayı 10 üzerinden kaç veriyorsun?</legend>
        <div class="score">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `
          <label class="chip"><input type="radio" name="score" value="${n}" ${current.score === n ? 'checked' : ''}>${n}</label>`).join('')}</div>
      </fieldset>
      <p class="error" id="w-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">${current.id ? 'Güncelle' : 'Kaydet'}</button>
    </form>

    <section class="card">
      <h2><i class="ti ti-history" aria-hidden="true"></i> Geçmiş haftalar</h2>
      ${s.reviews.filter(r => r.week_start !== ws).map(r => `
        <article class="review">
          <header><strong>${esc(new Date(r.week_start + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }))} haftası</strong>
            ${r.score ? `<span class="badge ${r.score >= 7 ? 'ok' : r.score >= 4 ? 'gold' : 'warn'}">${r.score}/10</span>` : ''}</header>
          ${r.actual ? `<p class="small">${esc(r.actual)}</p>` : ''}
          ${r.gap_reason ? `<p class="small muted">Fark: ${esc(r.gap_reason)}</p>` : ''}
          ${(r.actions || []).filter(Boolean).length ? `<ul class="small">${r.actions.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        </article>`).join('') || '<p class="muted small">İlk haftalık değerlendirmeni yaptığında burada görünecek.</p>'}
    </section>
  </div>`;
}

// ====================================================================
// Gelir
function viewIncome() {
  const target = Number(s.targets.monthly_income) || 0;
  const thisMonth = dayKey(monthStart());
  const byMonth = {};
  s.income.forEach(e => { byMonth[e.month] = (byMonth[e.month] || 0) + Number(e.amount); });
  const total = byMonth[thisMonth] || 0;
  const p = pct(total, target);
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return dayKey(d); });
  const max = Math.max(target, 1, ...months.map(m => byMonth[m] || 0));

  return `
  <div class="compose">
    <section class="card">
      <h2><i class="ti ti-target-arrow" aria-hidden="true"></i> Bu ayki hedef</h2>
      <div class="income-big">${formatTL(total)}<span class="of"> / ${formatTL(target)}</span></div>
      <div class="meter lg" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Aylık gelir hedefi"><span style="width:${p}%" class="${p >= 100 ? 'done' : ''}"></span></div>
      <p class="small muted">%${p} · kalan ${formatTL(Math.max(0, target - total))}</p>

      <div class="bars income-bars" role="img" aria-label="Son 6 ay gelir">
        ${months.map(m => { const v = byMonth[m] || 0; return `<div class="bar-col" title="${formatTL(v)}">
          <span class="bar-val">${v ? Math.round(v / 1000) + 'B' : ''}</span>
          <span class="bar ${m === thisMonth ? 'now' : ''}" style="height:${Math.round((v / max) * 100)}%"></span>
          <span class="bar-lbl">${new Date(m + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'short' })}</span></div>`; }).join('')}
      </div>
      <p class="hint-box"><i class="ti ti-info-circle" aria-hidden="true"></i>
        Bu kayıtlar yalnızca senin takibin içindir; kimse göremez. Kazancını başkalarına anlatırken rakam vaadi vermemeye dikkat et.</p>
    </section>

    <section class="card">
      <h2><i class="ti ti-plus" aria-hidden="true"></i> Gelir ekle</h2>
      <form data-form="income" novalidate>
        <div class="form-2">
          <div class="field"><label for="n-amount">Tutar (TL) *</label><input id="n-amount" name="amount" type="number" inputmode="decimal" min="0" step="0.01"></div>
          <div class="field"><label for="n-month">Ay</label><input id="n-month" name="month" type="month" value="${thisMonth.slice(0, 7)}"></div>
        </div>
        <div class="form-2">
          <div class="field"><label for="n-source">Kaynak</label><select id="n-source" name="source">${INCOME_SOURCES.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label for="n-note">Not</label><input id="n-note" name="note" maxlength="120"></div>
        </div>
        <p class="error" id="n-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">Ekle</button>
      </form>
      <h3 style="margin-top:18px">Kayıtlar</h3>
      <ul class="entry-list">
        ${s.income.slice(0, 24).map(e => `<li>
          <span><strong>${formatTL(e.amount)}</strong> <span class="small muted">${esc(new Date(e.month + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }))} · ${esc(e.source || '')}${e.note ? ' · ' + esc(e.note) : ''}</span></span>
          <button class="icon-btn sm" data-act="del-income" data-id="${e.id}" aria-label="Kaydı sil"><i class="ti ti-x" aria-hidden="true"></i></button></li>`).join('') || '<li class="muted small">Henüz kayıt yok.</li>'}
      </ul>
    </section>
  </div>`;
}

// ====================================================================
// Uyum
function viewCompliance() {
  const covered = new Set(s.consents.filter(c => c.kind === 'kvkk_aydinlatma' && c.granted).map(c => c.prospect_id));
  const open = s.prospects.filter(p => ACTIVE_STAGES.includes(p.stage) || ['musteri', 'is_ortagi'].includes(p.stage));
  const missing = open.filter(p => !covered.has(p.id));
  const p = pct(open.length - missing.length, open.length);

  return `
  <div class="compose">
    <section class="card">
      <h2><i class="ti ti-shield-check" aria-hidden="true"></i> KVKK aydınlatma kapsamı</h2>
      <div class="income-big">%${open.length ? p : 100}<span class="of"> · ${open.length - missing.length} / ${open.length} aday</span></div>
      <div class="meter lg" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="KVKK kapsamı"><span style="width:${open.length ? p : 100}%" class="${p >= 100 ? 'done' : ''}"></span></div>
      <p class="small muted">Bir kişinin bilgisini kaydettiğinde, bunu iletişim amacıyla yaptığını ona söylemelisin (aydınlatma). Söylediysen buradan işaretle.</p>
      <ul class="entry-list">
        ${missing.slice(0, 30).map(x => `<li><span>${esc(x.full_name)}</span>
          <button class="btn btn-ghost sm" data-act="consent" data-id="${x.id}"><i class="ti ti-check" aria-hidden="true"></i> Bilgilendirdim</button></li>`).join('')
          || '<li class="muted small">Tüm açık adaylarının aydınlatma kaydı var.</li>'}
      </ul>
      ${missing.length > 30 ? `<p class="small muted">+${missing.length - 30} aday daha</p>` : ''}
    </section>

    <section class="card">
      <h2><i class="ti ti-trash" aria-hidden="true"></i> Silme talepleri</h2>
      <p class="small muted">Bir kişi verilerinin silinmesini isterse (KVKK md. 7) adayı Kazanım'dan sil, sonra burada kalıcı olarak kaldır. Kalıcı silme geri alınamaz; geçmiş ve onay kayıtları da silinir.</p>
      <ul class="entry-list">
        ${s.deleted.map(x => `<li><span>${esc(x.full_name)} <span class="small muted">· ${esc(new Date(x.deleted_at).toLocaleDateString('tr-TR'))}</span></span>
          <span class="quick"><button class="btn btn-ghost sm" data-act="restore" data-id="${x.id}">Geri al</button>
          <button class="btn btn-ghost sm" data-act="purge" data-id="${x.id}">Kalıcı sil</button></span></li>`).join('')
          || '<li class="muted small">Silinmiş aday yok.</li>'}
      </ul>
    </section>

    <section class="card" style="grid-column:1/-1">
      <h2><i class="ti ti-scale" aria-hidden="true"></i> Etik ve yasal hatırlatmalar</h2>
      <ul class="feature-list">
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>Kazanç vaadi yok:</strong> Rakam, garanti, "kolay/pasif gelir" deme. Hızlı zenginlik vaadi yönetmelikle yasak.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>Sağlık iddiası yok:</strong> Ürünler ilaç değildir; "tedavi eder, iyileştirir" deme, hastalık adı anma.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>Baskı yok:</strong> Karar için zaman tanı; "son şans", "hemen karar ver" deme.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>30 gün cayma hakkı:</strong> Doğrudan satışla alınan ürünlerde müşteriye koşulsuz cayma hakkını hatırlat.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>İYS:</strong> Onayı olmayan kişilere toplu ticari SMS veya e-posta gönderilemez. Bu uygulama toplu ileti göndermez; birebir mesajlarda da kişinin isteğine saygı göster.</span></li>
        <li><i class="ti ti-circle-check" aria-hidden="true"></i><span><strong>Hassas veri yok:</strong> Adayların sağlık bilgisini, kimlik ve kart numarasını kaydetme.</span></li>
      </ul>
      <p class="small muted">Bu bölüm bilgilendirme amaçlıdır, hukuki danışmanlık değildir. Şirketinin distribütör politikasını da takip et.</p>
    </section>
  </div>`;
}

// ====================================================================
// Olaylar
function onClick(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/olcum?tab=${s.tab}`); draw(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'targets': targetsDialog(); break;
    case 'close': el.querySelector('#o-dialog').close(); break;
    case 'fill-actual': el.querySelector('#w-actual').value = weekSummary(sumRange(s.days, keysBetween(weekStart())), s.targets); break;
    case 'del-income': delIncome(b, id); break;
    case 'consent': addConsent(b, id); break;
    case 'restore': restore(id); break;
    case 'purge': purge(b, id); break;
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (form.dataset.form === 'targets') await saveTargets(form);
    if (form.dataset.form === 'review') await saveReview(form);
    if (form.dataset.form === 'income') await addIncome(form);
  } finally { if (btn.isConnected) btn.disabled = false; }
}

async function saveTargets(form) {
  const err = form.querySelector('#g-error');
  const vals = {};
  for (const k of Object.keys(DEFAULT_TARGETS)) {
    const v = Number(form.elements.namedItem(k).value);
    if (!Number.isFinite(v) || v < 0 || (k !== 'monthly_income' && (!Number.isInteger(v) || v > 500))) {
      err.textContent = 'Hedefler 0 veya pozitif tam sayı olmalı.'; return;
    }
    vals[k] = v;
  }
  const { data, error } = await supabase.from('kpi_targets').upsert({ org_id: ctx.org.id, user_id: ctx.user.id, ...vals }).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.targets = { ...DEFAULT_TARGETS, ...data };
  el.querySelector('#o-dialog').close();
  draw(); toast('Hedefler kaydedildi.');
}

async function saveReview(form) {
  const err = form.querySelector('#w-error');
  const f = n => form.elements.namedItem(n);
  const actions = [0, 1, 2].map(i => f('action' + i).value.trim()).filter(Boolean);
  const score = Number(form.querySelector('[name="score"]:checked')?.value) || null;
  if (!f('actual').value.trim() && !actions.length) { err.textContent = 'En azından gerçekleşeni ya da bir eylemi yaz.'; return; }
  if (!score) { err.textContent = 'Haftaya 1-10 arası bir puan ver.'; return; }
  err.textContent = '';
  const row = {
    org_id: ctx.org.id, owner_id: ctx.user.id, week_start: dayKey(weekStart()),
    planned: f('planned').value.trim() || null, actual: f('actual').value.trim() || null,
    gap_reason: f('gap_reason').value.trim() || null, actions, score
  };
  const { data, error } = await supabase.from('weekly_reviews').upsert(row, { onConflict: 'owner_id,week_start' }).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.reviews = [data, ...s.reviews.filter(r => r.week_start !== data.week_start)];
  draw();
  toast(score >= 7 ? `Güzel bir hafta: ${score}/10. Devam!` : `Kaydedildi (${score}/10). Gelecek hafta 3 eyleme odaklan.`);
}

async function addIncome(form) {
  const err = form.querySelector('#n-error');
  const f = n => form.elements.namedItem(n);
  const amount = Number(f('amount').value);
  const month = f('month').value;
  if (!Number.isFinite(amount) || amount <= 0) { err.textContent = 'Geçerli bir tutar gir.'; f('amount').focus(); return; }
  if (!/^\d{4}-\d{2}$/.test(month)) { err.textContent = 'Ay seç.'; return; }
  err.textContent = '';
  const { data, error } = await supabase.from('income_entries').insert({
    org_id: ctx.org.id, amount, month: month + '-01', source: f('source').value, note: f('note').value.trim() || null
  }).select().single();
  if (error) { err.textContent = trError(error); return; }
  s.income = [data, ...s.income].sort((a, b) => (a.month < b.month ? 1 : -1));
  draw(); toast(`${formatTL(amount)} eklendi.`);
}

async function delIncome(btn, id) {
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.classList.add('btn-danger'); toast('Silmek için tekrar dokun.'); return; }
  const { error } = await supabase.from('income_entries').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  s.income = s.income.filter(e => e.id !== id); draw();
}

async function addConsent(btn, id) {
  btn.disabled = true;
  const { error } = await supabase.from('consents').insert({ org_id: ctx.org.id, prospect_id: id, kind: 'kvkk_aydinlatma', granted: true, method: 'sözlü / mesaj' });
  if (error) { btn.disabled = false; toast(trError(error)); return; }
  s.consents.push({ prospect_id: id, kind: 'kvkk_aydinlatma', granted: true });
  draw();
}

async function restore(id) {
  const { error } = await supabase.from('prospects').update({ deleted_at: null }).eq('id', id);
  if (error) { toast(trError(error)); return; }
  const p = s.deleted.find(x => x.id === id);
  s.deleted = s.deleted.filter(x => x.id !== id);
  if (p) s.prospects.push({ ...p, deleted_at: null });
  draw(); toast('Aday geri alındı.');
}

async function purge(btn, id) {
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1'; btn.classList.add('btn-danger'); btn.textContent = 'Geri alınamaz, emin misin?'; return;
  }
  const { error } = await supabase.from('prospects').delete().eq('id', id);
  if (error) { toast(trError(error)); return; }
  s.deleted = s.deleted.filter(x => x.id !== id);
  draw(); toast('Aday ve tüm kayıtları kalıcı olarak silindi.');
}
