// Aranabilir aday seçici (combobox). Uzun aday listelerinde açılır menü yerine kullanılır.
// Kullanım: html = pickerHTML({ id, label, prospects, selectedId });  sonra bindPicker(root, { id, prospects, onSelect })
import { esc } from '../ui.js';

const MAX_RESULTS = 8;
const norm = v => String(v || '').toLocaleLowerCase('tr-TR')
  .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));

export function searchProspects(prospects, q, limit = MAX_RESULTS) {
  const n = norm(q).trim();
  if (!n) return [];
  const digits = q.replace(/\D/g, '');
  const scored = [];
  for (const p of prospects) {
    const name = norm(p.full_name).replace(/^[^a-z0-9]+/, '');
    let score = -1;
    if (name.startsWith(n)) score = 0;
    else if (name.split(/\s+/).some(w => w.startsWith(n))) score = 1;
    else if (name.includes(n)) score = 2;
    else if (digits.length >= 3 && String(p.phone || '').replace(/\D/g, '').includes(digits)) score = 3;
    else if (p.instagram && norm(p.instagram).includes(n)) score = 3;
    if (score >= 0) scored.push([score, p]);
  }
  scored.sort((a, b) => a[0] - b[0] || String(a[1].full_name).localeCompare(String(b[1].full_name), 'tr'));
  return scored.slice(0, limit).map(x => x[1]);
}

export function pickerHTML({ id, label = 'Aday', prospects, selectedId = '', name = '', placeholder = 'İsim ya da telefon yaz…' }) {
  const sel = prospects.find(p => p.id === selectedId);
  return `<div class="picker" data-picker="${id}">
    <label for="${id}-q">${esc(label)}</label>
    <input type="hidden" ${name ? `name="${name}"` : ''} id="${id}-val" value="${esc(sel?.id || '')}">
    <div class="picker-chosen" ${sel ? '' : 'hidden'}>
      <span><i class="ti ti-user-check" aria-hidden="true"></i> <strong>${esc(sel?.full_name || '')}</strong></span>
      <button type="button" class="icon-btn sm" data-picker-clear aria-label="Seçimi kaldır"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="picker-box" ${sel ? 'hidden' : ''}>
      <i class="ti ti-search" aria-hidden="true"></i>
      <input type="search" id="${id}-q" autocomplete="off" placeholder="${esc(placeholder)}"
        role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${id}-list">
      <ul class="picker-list" id="${id}-list" role="listbox" hidden></ul>
    </div>
    <span class="small muted picker-hint">${prospects.length} aday içinde arar</span>
  </div>`;
}

export function bindPicker(root, { id, prospects, onSelect }) {
  const wrap = root.querySelector(`[data-picker="${id}"]`);
  if (!wrap) return;
  const input = wrap.querySelector(`#${id}-q`);
  const list = wrap.querySelector(`#${id}-list`);
  const hidden = wrap.querySelector(`#${id}-val`);
  const box = wrap.querySelector('.picker-box');
  const chosen = wrap.querySelector('.picker-chosen');
  let results = [];
  let active = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const render = () => {
    results = searchProspects(prospects, input.value);
    if (!input.value.trim()) { close(); return; }
    list.innerHTML = results.length
      ? results.map((p, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${i === active}">
          <strong>${esc(p.full_name)}</strong>${p.phone ? `<span class="small muted"> · ${esc(p.phone)}</span>` : ''}</li>`).join('')
      : '<li class="picker-empty" aria-disabled="true">Eşleşen aday yok</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-o${active}`); else input.removeAttribute('aria-activedescendant');
  };
  const choose = p => {
    hidden.value = p ? p.id : '';
    chosen.querySelector('strong').textContent = p ? p.full_name : '';
    chosen.hidden = !p; box.hidden = !!p;
    input.value = ''; close();
    onSelect?.(p || null);
    if (!p) input.focus();
  };

  input.addEventListener('input', () => { active = -1; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; render(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Enter') { if (results.length) { e.preventDefault(); choose(results[Math.max(active, 0)]); } }
    else if (e.key === 'Escape') close();
  });
  // mousedown: input odak kaybetmeden önce seçimi yakala
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('[data-i]');
    if (li) { e.preventDefault(); choose(results[+li.dataset.i]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  wrap.querySelector('[data-picker-clear]').addEventListener('click', () => choose(null));
}
