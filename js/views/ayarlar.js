// Profil ve hesap ayarları
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { APP_VERSION } from '../config.js';

export function renderSettings(el, ctx, { recovery = false } = {}) {
  const p = ctx.profile || {};
  const level = p.career_level || 'Guest';

  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Hesap</div><h1>Ayarlar</h1></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <form class="card" id="profile-form" novalidate>
        <h2>Profil</h2>
        <div class="field"><label for="p-name">Ad soyad</label>
          <input id="p-name" name="full_name" value="${esc(p.full_name)}" required></div>
        <div class="field"><label for="p-phone">Telefon</label>
          <input id="p-phone" name="phone" type="tel" value="${esc(p.phone)}" placeholder="05xx xxx xx xx"></div>
        <div class="field"><label for="p-level">Kariyer seviyesi</label>
          <input id="p-level" name="career_level" value="${esc(level)}" placeholder="Örn. Guest"></div>
        <p class="error" id="profile-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">Kaydet</button>
      </form>

      <form class="card" id="pass-form" novalidate>
        <h2>${recovery ? 'Yeni şifre belirle' : 'Şifre değiştir'}</h2>
        <div class="field"><label for="n-pass">Yeni şifre</label>
          <input id="n-pass" name="password" type="password" minlength="6" autocomplete="new-password"></div>
        <p class="error" id="pass-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">Şifreyi güncelle</button>
      </form>

      <section class="card">
        <h2>Ekip</h2>
        <p><strong>${esc(ctx.org?.name || '—')}</strong></p>
        <p class="muted small">Rolün: ${esc(roleName(ctx.membership?.role))} · Plan: ${esc(ctx.org?.plan || 'free')}</p>
        <p class="muted small">Eski uygulama hâlâ çalışıyor: <a href="eski/">NM Asistanı (eski)</a></p>
        <p class="muted small">Sürüm ${esc(APP_VERSION)}</p>
        <button class="btn btn-ghost" id="logout"><i class="ti ti-logout" aria-hidden="true"></i> Çıkış yap</button>
      </section>
    </div>`;

  el.querySelector('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = el.querySelector('#profile-error');
    const full_name = f.full_name.value.trim();
    if (!full_name) { err.textContent = 'Ad soyad boş olamaz.'; return; }
    err.textContent = '';
    const { data, error } = await supabase.from('profiles')
      .update({ full_name, phone: f.phone.value.trim() || null, career_level: f.career_level.value.trim() || 'Guest' })
      .eq('id', ctx.user.id).select().single();
    if (error) { err.textContent = trError(error); return; }
    ctx.profile = data;
    toast('Profil kaydedildi.');
    document.dispatchEvent(new CustomEvent('ctx:changed'));
  });

  el.querySelector('#pass-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = el.querySelector('#pass-error');
    const password = e.currentTarget.password.value;
    if (password.length < 6) { err.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
    err.textContent = '';
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { err.textContent = trError(error); return; }
    e.currentTarget.reset();
    toast('Şifren güncellendi.');
  });

  el.querySelector('#logout').addEventListener('click', () => supabase.auth.signOut());
  if (recovery) el.querySelector('#n-pass').focus();
}

function roleName(role) {
  return { owner: 'Ekip sahibi', leader: 'Lider', member: 'Üye' }[role] || '—';
}
