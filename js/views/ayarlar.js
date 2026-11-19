// Profil ve hesap ayarları
import { supabase } from '../supabase.js';
import { esc, toast, trError } from '../ui.js';
import { APP_VERSION } from '../config.js';
import { AI_KEY, getApiKey } from './iletisim.js';

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

      <form class="card" id="ai-form" novalidate>
        <h2>AI asistan (isteğe bağlı)</h2>
        <p class="small muted">İletişim biriminde mesajları kişiselleştirmek için kendi Claude API anahtarını ekleyebilirsin.
          Anahtar <strong>yalnızca bu cihazın tarayıcısında</strong> saklanır, sunucuya gönderilmez.
          Kullanım ücreti API hesabına yansır.</p>
        <div class="field"><label for="ai-key">Claude API anahtarı</label>
          <input id="ai-key" name="key" type="password" autocomplete="off" placeholder="${getApiKey() ? 'Kayıtlı (değiştirmek için yeni anahtar gir)' : 'sk-ant-…'}"></div>
        <p class="error" id="ai-error" role="alert"></p>
        <div class="quick">
          <button class="btn btn-primary" type="submit">Kaydet</button>
          ${getApiKey() ? '<button class="btn btn-ghost" type="button" id="ai-remove">Anahtarı sil</button>' : ''}
        </div>
      </form>

      <section class="card">
        <h2>Ekip</h2>
        ${ctx.membership?.role === 'owner' ? `<form id="org-form" class="inline-form" novalidate style="margin-bottom:8px">
          <input name="name" value="${esc(ctx.org?.name)}" maxlength="80" aria-label="Ekip adı">
          <button class="btn btn-primary" type="submit">Kaydet</button></form><p class="error" id="org-error" role="alert"></p>`
          : `<p><strong>${esc(ctx.org?.name || '—')}</strong></p>`}
        <p class="muted small">Rolün: ${esc(roleName(ctx.membership?.role))} · Plan: ${esc(planName(ctx.org?.plan))} · ${ctx.memberships?.length || 1} ekipte üyesin</p>
        <p class="muted small">Eski uygulama hâlâ çalışıyor: <a href="eski/">NM Asistanı (eski)</a></p>
        <p class="muted small">Sürüm ${esc(APP_VERSION)}</p>
        <button class="btn btn-ghost" id="logout"><i class="ti ti-logout" aria-hidden="true"></i> Çıkış yap</button>
      </section>

      <section class="card">
        <h2>Verilerim (KVKK)</h2>
        <p class="small muted">Adaylarını, temas geçmişini, randevularını ve hedeflerini tek dosya olarak indir.
          Adaylar Excel'de açılabilen CSV olarak da indirilebilir.</p>
        <div class="quick">
          <button class="btn btn-ghost" id="export-json"><i class="ti ti-download" aria-hidden="true"></i> Tüm verilerim (JSON)</button>
          <button class="btn btn-ghost" id="export-csv"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Adaylar (CSV)</button>
        </div>
        <p class="small muted" style="margin-top:10px">Hesabının tamamen silinmesini istersen ekip sahibine ya da uygulama yöneticisine yaz.</p>
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

  el.querySelector('#ai-form').addEventListener('submit', e => {
    e.preventDefault();
    const key = e.currentTarget.elements.namedItem('key').value.trim();
    const err = el.querySelector('#ai-error');
    if (!/^sk-ant-[\w-]{20,}$/.test(key)) { err.textContent = 'Geçerli bir anahtar gir (sk-ant- ile başlar).'; return; }
    err.textContent = '';
    localStorage.setItem(AI_KEY, key);
    toast('API anahtarı bu cihaza kaydedildi.');
    renderSettings(el, ctx);
  });
  el.querySelector('#ai-remove')?.addEventListener('click', () => {
    localStorage.removeItem(AI_KEY);
    localStorage.removeItem('nma_api_key');
    toast('API anahtarı silindi.');
    renderSettings(el, ctx);
  });

  el.querySelector('#logout').addEventListener('click', () => supabase.auth.signOut());

  el.querySelector('#org-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.currentTarget.elements.namedItem('name').value.trim();
    const err = el.querySelector('#org-error');
    if (name.length < 2) { err.textContent = 'Ekip adı en az 2 karakter olmalı.'; return; }
    err.textContent = '';
    const { error } = await supabase.from('organizations').update({ name }).eq('id', ctx.org.id);
    if (error) { err.textContent = trError(error); return; }
    toast('Ekip adı güncellendi.');
    document.dispatchEvent(new CustomEvent('ctx:reload'));
  });
  el.querySelector('#export-json').addEventListener('click', e => exportData(e.currentTarget, 'json'));
  el.querySelector('#export-csv').addEventListener('click', e => exportData(e.currentTarget, 'csv'));
  if (recovery) el.querySelector('#n-pass').focus();
}

function planName(plan) {
  return { free: 'Ücretsiz', pro: 'Pro' }[plan] || plan || 'Ücretsiz';
}

async function exportData(btn, kind) {
  btn.disabled = true;
  try {
    const tables = kind === 'csv' ? ['prospects'] : ['prospects', 'interactions', 'tasks', 'consents', 'appointments', 'stage_events',
      'weekly_reviews', 'income_entries', 'kpi_targets', 'scripts', 'content_posts', 'academy_progress'];
    const out = {};
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(20000);
      if (error) throw error;
      out[t] = data;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'csv') {
      const cols = ['full_name', 'phone', 'instagram', 'stage', 'temperature', 'channel', 'source', 'occupation', 'interests', 'notes', 'next_follow_up_at', 'last_contact_at', 'created_at'];
      const cell = v => { const x = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const rows = out.prospects.filter(p => !p.deleted_at).map(p => cols.map(c => cell(p[c])).join(';'));
      download(`nm-adaylar-${stamp}.csv`, '\ufeff' + [cols.join(';'), ...rows].join('\n'), 'text/csv;charset=utf-8');
    } else {
      download(`nm-verilerim-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), ...out }, null, 2), 'application/json');
    }
    toast('Dosya indirildi.');
  } catch (err) { toast(trError(err)); }
  btn.disabled = false;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function roleName(role) {
  return { owner: 'Ekip sahibi', leader: 'Lider', member: 'Üye' }[role] || '—';
}
