// Henüz kurulmamış birimler için bilgi sayfası (Faz 0 yer tutucu)
import { findUnit } from '../units.js';
import { esc } from '../ui.js';

export function renderUnit(el, unitId) {
  const u = findUnit(unitId);
  if (!u) {
    el.innerHTML = `<div class="card empty"><i class="ti ti-compass-off" aria-hidden="true"></i>
      <h2>Sayfa bulunamadı</h2><a class="btn btn-ghost" href="#/">Panele dön</a></div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${u.group === 'grow' ? 'Aday ve büyüme' : 'Ekip ve sistem'}</div>
        <h1>${esc(u.title)}</h1>
        <p class="muted">${esc(u.summary)}</p>
      </div>
      <span class="badge ${u.phase === 1 ? 'gold' : ''}">Faz ${u.phase}'de açılıyor</span>
    </div>

    <div class="grid" style="grid-template-columns:minmax(0,1fr)">
      <section class="card">
        <h2>Bu birimde neler olacak?</h2>
        <ul class="feature-list">
          ${u.features.map(f => `<li><i class="ti ti-circle-check" aria-hidden="true"></i><span>${esc(f)}</span></li>`).join('')}
        </ul>
      </section>
      <section class="card empty">
        <i class="ti ti-tools" aria-hidden="true"></i>
        <h2>Yapım aşamasında</h2>
        <p class="muted">Veritabanı altyapısı hazır. Bu birimin ekranları Faz ${u.phase} kapsamında kurulacak.</p>
        <a class="btn btn-ghost" href="#/">Panele dön</a>
      </section>
    </div>`;
}
