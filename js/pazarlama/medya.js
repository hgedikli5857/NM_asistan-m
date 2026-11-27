// İçerik fabrikası Faz 2: stok video/fotoğraf (Pixabay ya da Pexels) ve AI görsel (Gemini) seçici.
// Sunucu fonksiyonu 'medya' anahtarları gizli tutar. Seçilen dosya File olarak geri verilir;
// Reels sahnesine (loadClip) ya da Gönderi görseline (gPick) aynı yoldan girer.
import { supabase } from '../supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { esc, toast } from '../ui.js';

let status = null;
export async function medyaStatus(force = false) {
  if (status && !force) return status;
  const { data, error } = await supabase.functions.invoke('medya', { body: { action: 'status' } });
  status = error ? { stok: false, gorsel: false } : data;
  return status;
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('medya', { body });
  if (error) {
    let j = null; try { j = await error.context?.json?.(); } catch { /* yok */ }
    throw new Error(j?.message || error.message);
  }
  return data;
}

// İçerik türüne göre hazır görsel yönü (sosyal medya rehberi: doğal, samimi, stok kokmayan)
export const STYLES = [
  { id: 'dogal', label: 'Doğal ışık', text: 'gün ışığı alan sade bir ev ortamı, doğal ve samimi' },
  { id: 'sabah', label: 'Sabah rutini', text: 'sabahın erken saatleri, sıcak tonlar, sakin bir başlangıç hissi' },
  { id: 'doga', label: 'Doğa', text: 'açık hava, yeşil doğa, yürüyüş yolu, ferah bir an' },
  { id: 'calisma', label: 'Çalışma masası', text: 'düzenli bir çalışma masası, defter ve kahve, odaklanma hissi' },
  { id: 'minimal', label: 'Minimal', text: 'tek renk sade arka plan, bol boşluk, yumuşak gölgeler' }
];

const clean = t => String(t || '').replace(/\n/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
// Sahne metninden kısa arama kelimesi (ilk 4 anlamlı kelime)
export function queryFrom(text) {
  const stop = new Set(['ve', 'ile', 'bir', 'bu', 'şu', 'için', 'ama', 'da', 'de', 'mi', 'ben', 'sen', 'çok', 'daha', 'gibi', 'her']);
  return clean(text).split(' ').filter(w => w.length > 2 && !stop.has(w.toLocaleLowerCase('tr-TR'))).slice(0, 4).join(' ');
}

async function fileFromUrl(url, name, viaProxy) {
  let blob;
  if (!viaProxy) {
    try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) blob = await r.blob(); } catch { /* sunucu üzerinden dene */ }
  }
  if (!blob) {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/medya`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ action: 'indir', url }) });
    if (!r.ok) { let j = null; try { j = await r.json(); } catch { /* yok */ } throw new Error(j?.message || `İndirilemedi (HTTP ${r.status}).`); }
    blob = await r.blob();
  }
  return new File([blob], name, { type: blob.type || (name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg') });
}
function fileFromB64(b64, mime, name) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

// dlg: <dialog>, opts: { scope: 'reels'|'gonderi', label, query, prompt, onPick(file, credit) }
export async function openPicker(dlg, opts) {
  const st = await medyaStatus();
  const kinds = [
    ...(opts.scope === 'reels' ? [{ id: 'video', label: 'Stok video', icon: 'ti-movie', ok: st.stok }] : []),
    { id: 'foto', label: 'Stok fotoğraf', icon: 'ti-photo', ok: st.stok },
    { id: 'ai', label: 'AI görsel', icon: 'ti-sparkles', ok: st.gorsel }
  ];
  const p = { kind: opts.kind || kinds.find(k => k.ok)?.id || kinds[0].id, q: opts.query || '', items: [], page: 1, more: false,
    sel: null, busy: false, prompt: opts.prompt || '', style: 'dogal', ai: null, err: '' };
  const oran = opts.scope === 'reels' ? '9:16' : '4:5';

  function body() {
    const k = kinds.find(x => x.id === p.kind);
    if (!k.ok) {
      const name = p.kind === 'ai' ? 'GEMINI_API_KEY' : 'PIXABAY_API_KEY';
      const where = p.kind === 'ai' ? 'aistudio.google.com → Get API key' : 'pixabay.com\'a ücretsiz üye ol → pixabay.com/api/docs sayfasında "key" satırı';
      return `<div class="check-box warn"><p><b>${esc(k.label)} henüz açık değil.</b> Anahtarı al (${esc(where)}), sonra Supabase → Edge Functions → Secrets bölümüne <b>${name}</b> adıyla ekle.</p>
        <button type="button" class="btn btn-ghost sm" data-mp="recheck"><i class="ti ti-refresh" aria-hidden="true"></i> Ekledim, tekrar kontrol et</button></div>`;
    }
    if (p.kind === 'ai') {
      return `<div class="field"><label for="mp-prompt">Görselde ne olsun?</label>
          <textarea id="mp-prompt" rows="3" maxlength="600" placeholder="Ör. Pencere kenarında kahvesini içip defterine plan yazan biri">${esc(p.prompt)}</textarea></div>
        <div class="chips" role="radiogroup" aria-label="Görsel yönü">${STYLES.map(x =>
          `<button type="button" class="chip" role="radio" aria-checked="${x.id === p.style}" data-mp="style" data-id="${x.id}">${esc(x.label)}</button>`).join('')}</div>
        <p class="small muted">Görsel ${oran} oranında, yazısız ve logosuz üretilir; yazılar uygulamada eklenir. Günlük AI hakkından 1 kullanım düşer.</p>
        <div class="quick"><button type="button" class="btn btn-primary" data-mp="gen" ${p.busy ? 'disabled' : ''}>
          <i class="ti ti-${p.busy ? 'loader-2' : 'sparkles'}" aria-hidden="true"></i> ${p.busy ? 'Üretiliyor… (10–30 sn)' : p.ai ? 'Yeniden üret' : 'Görseli üret'}</button></div>
        ${p.ai ? `<figure class="mp-ai"><img src="${p.ai.url}" alt="Üretilen görsel"></figure>
          <div class="quick"><button type="button" class="btn btn-gold" data-mp="use-ai"><i class="ti ti-check" aria-hidden="true"></i> ${esc(opts.label)} için kullan</button></div>` : ''}`;
    }
    return `<form class="mp-search" data-mp-form>
        <input id="mp-q" type="search" value="${esc(p.q)}" placeholder="${p.kind === 'video' ? 'Ör. sabah kahvesi, yürüyüş, çalışma masası' : 'Ör. sağlıklı kahvaltı, doğa, ev ofisi'}" aria-label="Arama" enterkeyhint="search">
        <button class="btn btn-primary" type="submit" ${p.busy ? 'disabled' : ''}><i class="ti ti-search" aria-hidden="true"></i> Ara</button></form>
      ${p.note ? `<p class="small muted">${esc(p.note)}</p>` : ''}
      ${p.items.length ? `<ul class="mp-grid" role="listbox" aria-label="Sonuçlar">${p.items.map((it, i) => `<li>
          <button type="button" role="option" aria-selected="${p.sel === i}" data-mp="pick" data-i="${i}" class="mp-tile">
            <img src="${esc(it.thumb)}" alt="${esc(it.alt || (p.kind === 'video' ? 'Stok video' : 'Stok fotoğraf'))}" loading="lazy">
            ${p.kind === 'video' ? `<span class="mp-dur">${it.dur} sn</span>` : ''}
          </button></li>`).join('')}</ul>
        ${p.more ? `<div class="quick"><button type="button" class="btn btn-ghost" data-mp="more" ${p.busy ? 'disabled' : ''}>Daha fazla göster</button></div>` : ''}
        <p class="small muted">Görseller ${p.source === 'Pexels' ? '<a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>' : '<a href="https://pixabay.com" target="_blank" rel="noopener">Pixabay</a>'}'tan; ticari kullanım ücretsiz. Yatay videolar dikey olarak ortadan kırpılır.</p>`
      : p.busy ? '<p class="muted">Aranıyor…</p>' : p.searched ? '<p class="muted">Sonuç yok. Daha genel bir kelime dene (ör. "sabah", "kahve", "doğa") ya da İngilizce yaz (ör. "morning coffee").</p>' : ''}`;
  }
  function foot() {
    if (p.kind === 'ai' || p.sel === null) return '';
    const it = p.items[p.sel];
    return `<div class="mp-foot"><span class="small">${esc(it.by ? 'Çeken: ' + it.by : '')}</span>
      <button type="button" class="btn btn-gold" data-mp="use" ${p.busy ? 'disabled' : ''}><i class="ti ti-${p.busy ? 'loader-2' : 'check'}" aria-hidden="true"></i> ${p.busy ? 'İndiriliyor…' : esc(opts.label) + ' için kullan'}</button></div>`;
  }
  function draw() {
    dlg.innerHTML = `<div class="sheet-body mp">
      <header class="sheet-head"><h2 id="p-dialog-title">${esc(opts.label)}: görsel bul</h2>
        <button type="button" class="icon-btn" data-mp="close" aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></header>
      <div class="seg" role="tablist" aria-label="Kaynak">${kinds.map(k =>
        `<button role="tab" data-mp="kind" data-id="${k.id}" aria-selected="${k.id === p.kind}"><i class="ti ${k.icon}" aria-hidden="true"></i> ${esc(k.label)}</button>`).join('')}</div>
      ${body()}
      <p class="error" role="alert">${esc(p.err)}</p>
      ${foot()}</div>`;
  }

  async function search(page = 1) {
    const q = (dlg.querySelector('#mp-q')?.value || p.q).trim();
    if (q.length < 2) { p.err = 'Aramak için en az 2 harf yaz.'; draw(); return; }
    p.q = q; p.busy = true; p.err = ''; if (page === 1) { p.items = []; p.sel = null; } draw();
    try {
      const d = await call({ action: 'stok', q, kind: p.kind, page });
      p.items = page === 1 ? d.items : [...p.items, ...d.items]; p.page = page; p.more = d.more; p.searched = true; p.source = d.source || 'Pixabay';
      if (d.q && d.q !== q) { p.note = `"${q}" için sonuç yoktu; İngilizce "${d.q}" olarak arandı.`; p.q = d.q; } else if (page === 1) p.note = '';
    } catch (e) { p.err = e.message; }
    p.busy = false; draw();
  }
  async function useStock() {
    const it = p.items[p.sel]; if (!it) return;
    p.busy = true; p.err = ''; draw();
    try {
      const src = p.source || 'Pixabay';
      const file = await fileFromUrl(it.file, `${src.toLowerCase()}-${it.id}.${p.kind === 'video' ? 'mp4' : 'jpg'}`);
      dlg.close(); opts.onPick(file, it.by ? `${src} · ${it.by}` : src);
    } catch (e) { p.busy = false; p.err = e.message; draw(); }
  }
  async function gen() {
    const prompt = (dlg.querySelector('#mp-prompt')?.value || '').trim();
    if (prompt.length < 3) { p.err = 'Görselde ne olacağını birkaç kelimeyle yaz.'; draw(); return; }
    p.prompt = prompt; p.busy = true; p.err = ''; draw();
    try {
      const style = STYLES.find(x => x.id === p.style);
      const d = await call({ action: 'gorsel', prompt: `${prompt}. Ortam: ${style.text}.`, oran });
      if (p.ai) URL.revokeObjectURL(p.ai.url);
      const file = fileFromB64(d.b64, d.mime, `ai-gorsel-${Date.now()}.${d.mime.includes('jpeg') ? 'jpg' : 'png'}`);
      p.ai = { file, url: URL.createObjectURL(file) };
    } catch (e) { p.err = e.message; }
    p.busy = false; draw();
  }

  dlg.onclick = e => {
    const b = e.target.closest('[data-mp]'); if (!b) return;
    const a = b.dataset.mp;
    if (a === 'close') dlg.close();
    else if (a === 'kind' && !p.busy) { p.prompt = dlg.querySelector('#mp-prompt')?.value ?? p.prompt; p.kind = b.dataset.id; p.items = []; p.sel = null; p.searched = false; p.err = ''; draw(); if (p.kind !== 'ai' && p.q && kinds.find(k => k.id === p.kind).ok) search(); }
    else if (a === 'pick') { p.sel = +b.dataset.i; draw(); }
    else if (a === 'more') search(p.page + 1);
    else if (a === 'use') useStock();
    else if (a === 'style') { p.prompt = dlg.querySelector('#mp-prompt')?.value ?? p.prompt; p.style = b.dataset.id; draw(); }
    else if (a === 'gen') gen();
    else if (a === 'use-ai' && p.ai) { dlg.close(); opts.onPick(p.ai.file, 'AI görsel'); }
    else if (a === 'recheck') medyaStatus(true).then(s2 => { kinds.forEach(k => { k.ok = k.id === 'ai' ? s2.gorsel : s2.stok; }); if (!kinds.find(k => k.id === p.kind).ok) toast('Anahtar hâlâ görünmüyor; adı birebir aynı mı?'); draw(); });
  };
  dlg.onsubmit = e => { if (e.target.matches('[data-mp-form]')) { e.preventDefault(); e.stopPropagation(); search(1); } };
  dlg.onclose = () => { dlg.onclick = null; dlg.onsubmit = null; dlg.onclose = null; };
  draw();
  if (!dlg.open) dlg.showModal();
  if (p.kind !== 'ai' && p.q && kinds.find(k => k.id === p.kind).ok) search();
}
