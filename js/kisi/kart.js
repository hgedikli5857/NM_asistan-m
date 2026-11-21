// Kişi kartını bir kaba yerleştirir (görünüm + düzenleme + kayıt)
import { supabase } from '../supabase.js';
import { toast } from '../ui.js';
import { FIELDS, cardFromProspect, mergeLive, diffCard, kartHTML, kartFormHTML } from './model.js';
export * from './model.js';

async function callCrm(body) {
  const { data, error } = await supabase.functions.invoke('crm', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); msg = j?.message || j?.error || msg; } catch { /* yok */ }
    throw new Error(msg);
  }
  return data;
}

// Bir kaba kartı yerleştirir; onChange(prospect) güncel kaydı geri bildirir
export function mountKart(box, prospect, { onChange } = {}) {
  let p = prospect;
  let st = cardFromProspect(p);
  const paint = () => { box.innerHTML = kartHTML(st); };
  paint();

  // Bot panelinden canlı çek (sohbette yeni bilgi toplanmış olabilir)
  if (st.linked) {
    callCrm({ action: 'card', prospect_id: p.id }).then(r => {
      if (!r?.linked || !box.isConnected) return;
      st = mergeLive(st, r.card, p.stage);
      if (!box.querySelector('form')) paint();
    }).catch(() => { /* çevrimdışı: aynadaki kart kalır */ });
  }

  box.addEventListener('click', e => {
    const b = e.target.closest('[data-kart]');
    if (!b) return;
    if (b.dataset.kart === 'edit') { box.innerHTML = kartFormHTML(st); box.querySelector('input,select,textarea')?.focus(); }
    if (b.dataset.kart === 'cancel') paint();
  });

  box.addEventListener('submit', async e => {
    if (!e.target.matches('[data-kart-form]')) return;
    e.preventDefault();
    const form = e.target, err = form.querySelector('[data-kart-error]');
    const after = Object.fromEntries(FIELDS.map(f => [f.k, form.elements[f.k].value.trim()]));
    if (!after.ad_soyad || after.ad_soyad.length < 2) { err.textContent = 'Ad soyad en az 2 karakter olmalı.'; return; }
    if (after.yas && !(/^\d{1,3}$/.test(after.yas) && +after.yas >= 1 && +after.yas <= 120)) { err.textContent = 'Yaş 1-120 arasında olmalı.'; return; }
    const changes = diffCard(st.card, after);
    if (!Object.keys(changes).length) { paint(); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    try {
      if (st.linked) {
        const r = await callCrm({ action: 'card_save', prospect_id: p.id, fields: changes });
        if (!r?.linked) throw new Error('Bot panel bağlantısı bulunamadı.');
        const { data } = await supabase.from('prospects').select('*').eq('id', p.id).single();
        p = data || p;
        st = mergeLive(cardFromProspect(p), r.card, p.stage);
        toast('Kart kaydedildi; bot panel de güncellendi.');
      } else {
        const kart = { ...(p.extra?.kart || {}) };
        for (const k of ['yas', 'sehir', 'medeni_durum', 'cocuk_sayisi', 'facebook', 'diger_sosyal', 'kanal', 'ozel_not']) if (k in changes) kart[k] = changes[k];
        if ('yas' in changes) kart.yas = changes.yas ? +changes.yas : null;
        const upd = { extra: { ...(p.extra || {}), kart } };
        if ('ad_soyad' in changes) upd.full_name = after.ad_soyad;
        if ('meslek' in changes) upd.occupation = changes.meslek;
        if ('ilgi_alanlari' in changes) upd.interests = changes.ilgi_alanlari;
        if ('instagram' in changes) upd.instagram = changes.instagram;
        if ('liste_turu' in changes) upd.temperature = changes.liste_turu;
        if ('stage' in changes) upd.stage = changes.stage;
        const { data, error } = await supabase.from('prospects').update(upd).eq('id', p.id).select().single();
        if (error) throw error;
        p = data; st = cardFromProspect(p);
        toast('Kart kaydedildi.');
      }
      paint();
      onChange?.(p);
    } catch (ex) {
      err.textContent = `Kaydedilemedi: ${ex.message || ex}`;
      btn.disabled = false; btn.textContent = 'Kaydet';
    }
  });
}
