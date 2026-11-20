// Akademi: İlk 14 gün, 90 günlük program (dersler + quiz), rozetler
import { supabase, fetchAll } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { FIRST_14, MODULES, LESSONS, lessonById, PASS_RATIO } from '../akademi/content.js';
import { earnedBadges, programDay } from '../akademi/badges.js';
import { dailyMetrics, activeStreak } from '../olcum/metrics.js';

const TABS = [
  { id: 'baslangic', label: 'İlk 14 gün', icon: 'ti-rocket' },
  { id: 'program', label: '90 gün programı', icon: 'ti-school' },
  { id: 'rozet', label: 'Rozetler', icon: 'ti-award' }
];
let el, ctx, s;

export async function renderAkademi(target, context) {
  el = target; ctx = context;
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  s = { tab: TABS.some(t => t.id === tab) ? tab : 'baslangic', progress: new Map() };

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Ekip ve sistem</div><h1>Akademi</h1><p class="muted" id="a-sub">Yükleniyor…</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="Akademi sekmeleri">
      ${TABS.map(t => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === s.tab}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('')}
    </div>
    <div id="a-body"></div>
    <dialog id="a-dialog" class="sheet lesson-sheet" aria-labelledby="a-dialog-title"></dialog>`;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);

  const { data, error } = await supabase.from('academy_progress').select('*');
  if (error) throw error;
  data.forEach(r => s.progress.set(r.item_id, r));
  s.day = programDay(ctx.profile?.created_at || ctx.membership?.joined_at || new Date());
  draw();
}

function draw() {
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === s.tab));
  const lessonsDone = LESSONS.filter(l => s.progress.has(l.id)).length;
  const tasksDone = FIRST_14.filter(t => s.progress.has(t.id)).length;
  el.querySelector('#a-sub').textContent = s.day <= 90
    ? `Programın ${s.day}. günündesin · ${lessonsDone}/${LESSONS.length} ders · ${tasksDone}/${FIRST_14.length} başlangıç adımı`
    : `90 günlük programı geçtin · ${lessonsDone}/${LESSONS.length} ders tamam`;
  const body = el.querySelector('#a-body');
  if (s.tab === 'baslangic') body.innerHTML = viewStart();
  else if (s.tab === 'program') body.innerHTML = viewProgram();
  else { body.innerHTML = '<div class="card empty"><p class="muted">Hesaplanıyor…</p></div>'; loadBadges(body); }
}

// ====================================================================
function viewStart() {
  const done = FIRST_14.filter(t => s.progress.has(t.id)).length;
  return `<section class="card">
    <h2><i class="ti ti-rocket" aria-hidden="true"></i> İlk 14 gün kontrol listesi</h2>
    <div class="meter lg"><span style="width:${Math.round((done / FIRST_14.length) * 100)}%" class="${done === FIRST_14.length ? 'done' : ''}"></span></div>
    <p class="small muted">${done}/${FIRST_14.length} tamam. Yeni başlayanların çoğu ilk haftalarda ne yapacağını bilmediği için bırakır; bu liste o boşluğu doldurur.</p>
    <ul class="checklist">
      ${FIRST_14.map(t => `<li class="${s.progress.has(t.id) ? 'done' : ''} ${t.day <= s.day && !s.progress.has(t.id) ? 'due' : ''}">
        <label><input type="checkbox" data-task="${t.id}" ${s.progress.has(t.id) ? 'checked' : ''}>
          <span><strong>Gün ${t.day} · ${esc(t.title)}</strong><span class="small muted">${esc(t.tip)}</span></span></label></li>`).join('')}
    </ul></section>`;
}

function viewProgram() {
  const current = MODULES.find(m => s.day >= m.days[0] && s.day <= m.days[1])?.id;
  const next = LESSONS.find(l => !s.progress.has(l.id));
  return `
    ${next ? `<div class="card import-card"><i class="ti ti-player-play" aria-hidden="true"></i>
      <div><strong>Sıradaki ders: ${esc(next.title)}</strong><p class="small muted">${next.minutes} dakika · ${esc(MODULES.find(m => m.id === next.module).title)}</p></div>
      <div class="import-actions"><button class="btn btn-gold" data-lesson="${next.id}">Başla</button></div></div>` :
      '<div class="card empty"><i class="ti ti-certificate" aria-hidden="true"></i><h2>Tüm dersleri bitirdin</h2><p class="muted">Şimdi öğrendiklerini ekibine öğretme zamanı.</p></div>'}
    ${MODULES.map(m => {
      const list = LESSONS.filter(l => l.module === m.id);
      const done = list.filter(l => s.progress.has(l.id)).length;
      return `<section class="card module ${m.id === current ? 'current' : ''}">
        <header><div><h2>${esc(m.title)} <span class="small muted">· Gün ${m.days[0]}-${m.days[1]}</span></h2>
          <p class="small muted">${esc(m.summary)}</p></div><span class="badge ${done === list.length ? 'ok' : m.id === current ? 'gold' : ''}">${done}/${list.length}</span></header>
        <ol class="lesson-list">${list.map(l => {
          const p = s.progress.get(l.id);
          return `<li><button class="lesson ${p ? 'done' : ''}" data-lesson="${l.id}">
            <i class="ti ${p ? 'ti-circle-check' : 'ti-circle'}" aria-hidden="true"></i>
            <span>${esc(l.title)}</span><span class="small muted">${p ? `%${p.score ?? 100}` : l.minutes + ' dk'}</span></button></li>`;
        }).join('')}</ol></section>`;
    }).join('')}`;
}

function lessonDialog(id) {
  const l = lessonById(id);
  if (!l) return;
  const p = s.progress.get(id);
  const d = el.querySelector('#a-dialog');
  d.innerHTML = `<form data-form="quiz" data-id="${l.id}" novalidate>
    <header class="sheet-head"><div><div class="eyebrow">${esc(MODULES.find(m => m.id === l.module).title)} · ${l.minutes} dk</div>
      <h2 id="a-dialog-title">${esc(l.title)}</h2></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
    <div class="sheet-body lesson-body">
      ${l.body.map(par => `<p>${esc(par)}</p>`).join('')}
      <div class="card key"><h3>Akılda kalsın</h3><ul>${l.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card key ex"><h3><i class="ti ti-pencil" aria-hidden="true"></i> Alıştırma</h3><p>${esc(l.exercise)}</p></div>
      <h3>Kısa quiz</h3>
      ${l.quiz.map((q, qi) => `<fieldset class="quiz-q" data-q="${qi}"><legend>${qi + 1}. ${esc(q.q)}</legend>
        ${q.o.map((o, oi) => `<label class="quiz-o"><input type="radio" name="q${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')}
      </fieldset>`).join('')}
      <p class="error" id="q-error" role="alert"></p>
      ${p ? `<p class="small muted">Bu dersi %${p.score ?? 100} ile tamamladın. İstersen quizi tekrar çözebilirsin.</p>` : ''}
    </div>
    <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-act="close">Kapat</button>
      <button class="btn btn-primary" type="submit">Cevapları kontrol et</button></footer></form>`;
  d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
}

// ====================================================================
async function loadBadges(body) {
  const head = q => q.then(r => r.count || 0);
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  const [prospects, contacts, presentations, invites, wins, reviews, recent] = await Promise.all([
    head(supabase.from('prospects').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
    head(supabase.from('interactions').select('id', { count: 'exact', head: true }).neq('kind', 'not')),
    head(supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('kind', 'sunum')),
    head(supabase.from('stage_events').select('id', { count: 'exact', head: true }).eq('to_stage', 'davet').not('from_stage', 'is', null)),
    head(supabase.from('stage_events').select('id', { count: 'exact', head: true }).in('to_stage', ['musteri', 'is_ortagi']).not('from_stage', 'is', null)),
    head(supabase.from('weekly_reviews').select('id', { count: 'exact', head: true })),
    fetchAll(() => supabase.from('interactions').select('prospect_id, kind, occurred_at').gte('occurred_at', since))
  ]);
  const streak = activeStreak(dailyMetrics({ interactions: recent.data || [] }));
  const temel = LESSONS.filter(l => l.module === 'temel');
  const stats = {
    prospects, contacts, presentations, invites, wins, reviews, streak,
    lessons: LESSONS.filter(l => s.progress.has(l.id)).length, totalLessons: LESSONS.length,
    tasks: FIRST_14.filter(t => s.progress.has(t.id)).length, totalTasks: FIRST_14.length,
    temelDone: temel.every(l => s.progress.has(l.id))
  };
  const badges = earnedBadges(stats);
  if (s.tab !== 'rozet') return;
  body.innerHTML = `<p class="small muted">${badges.filter(b => b.earned).length}/${badges.length} rozet kazandın. Rozetler kaydettiğin aktivitelerden otomatik hesaplanır.</p>
    <div class="badge-grid">${badges.map(b => `<div class="card rozet ${b.earned ? 'on' : ''}">
      <span class="rozet-icon"><i class="ti ${b.icon}" aria-hidden="true"></i></span>
      <strong>${esc(b.title)}</strong><span class="small muted">${esc(b.desc)}</span>
      ${b.earned ? '<span class="badge ok">Kazanıldı</span>' : '<span class="badge">Kilitli</span>'}</div>`).join('')}</div>`;
}

// ====================================================================
function onClick(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) { s.tab = tab.dataset.tab; history.replaceState(null, '', `#/akademi?tab=${s.tab}`); draw(); return; }
  const les = e.target.closest('[data-lesson]');
  if (les) { lessonDialog(les.dataset.lesson); return; }
  if (e.target.closest('[data-act="close"]')) { el.querySelector('#a-dialog').close(); draw(); }
}

async function onChange(e) {
  const id = e.target.dataset.task;
  if (!id) return;
  const box = e.target;
  box.disabled = true;
  const q = box.checked
    ? supabase.from('academy_progress').upsert({ user_id: ctx.user.id, item_id: id, kind: 'gorev' }).select().single()
    : supabase.from('academy_progress').delete().eq('user_id', ctx.user.id).eq('item_id', id);
  const { data, error } = await q;
  box.disabled = false;
  if (error) { box.checked = !box.checked; toast(trError(error)); return; }
  if (box.checked) s.progress.set(id, data); else s.progress.delete(id);
  draw();
  if (box.checked && FIRST_14.every(t => s.progress.has(t.id))) toast('İlk 14 gün tamam! "Sağlam başlangıç" rozetini kazandın.');
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form !== 'quiz') return;
  const l = lessonById(form.dataset.id);
  const err = form.querySelector('#q-error');
  const answers = l.quiz.map((_, qi) => form.querySelector(`[name="q${qi}"]:checked`));
  if (answers.some(a => !a)) { err.textContent = 'Tüm soruları cevapla.'; return; }
  err.textContent = '';
  let correct = 0;
  l.quiz.forEach((q, qi) => {
    const fs = form.querySelector(`[data-q="${qi}"]`);
    fs.querySelectorAll('.quiz-o').forEach((lab, oi) => {
      lab.classList.toggle('right', oi === q.a);
      lab.classList.toggle('wrong', oi === +answers[qi].value && oi !== q.a);
    });
    if (+answers[qi].value === q.a) correct++;
  });
  const score = Math.round((correct / l.quiz.length) * 100);
  const btn = form.querySelector('[type="submit"]');
  if (correct / l.quiz.length < PASS_RATIO) {
    err.textContent = `${correct}/${l.quiz.length} doğru. Dersi bir kez daha okuyup tekrar dene.`;
    return;
  }
  btn.disabled = true;
  const prev = s.progress.get(l.id);
  const { data, error } = await supabase.from('academy_progress')
    .upsert({ user_id: ctx.user.id, item_id: l.id, kind: 'ders', score: Math.max(score, prev?.score || 0), completed_at: prev?.completed_at || new Date().toISOString() })
    .select().single();
  btn.disabled = false;
  if (error) { err.textContent = trError(error); return; }
  s.progress.set(l.id, data);
  btn.textContent = 'Tamamlandı';
  toast(`Ders tamamlandı: ${correct}/${l.quiz.length} doğru.`);
}

