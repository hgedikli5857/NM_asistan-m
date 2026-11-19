// Giriş / kayıt ekranı
import { supabase } from '../supabase.js';
import { esc, trError, toast } from '../ui.js';

export function renderAuth(root) {
  let mode = 'login';

  const draw = () => {
    root.innerHTML = `
      <main class="auth-wrap">
        <section class="auth-card card" aria-labelledby="auth-title">
          <div class="brand">
            <div class="logo-mark" aria-hidden="true">NM</div>
            <div>
              <h1 id="auth-title">NM Departmanı</h1>
              <div class="muted small">Küçük ama istikrarlı adımlar</div>
            </div>
          </div>

          <div class="tabs" role="tablist">
            <button type="button" role="tab" data-mode="login" aria-selected="${mode === 'login'}">Giriş yap</button>
            <button type="button" role="tab" data-mode="signup" aria-selected="${mode === 'signup'}">Hesap oluştur</button>
          </div>

          <form id="auth-form" novalidate>
            ${mode === 'signup' ? `
              <div class="field">
                <label for="f-name">Ad soyad</label>
                <input id="f-name" name="name" autocomplete="name" required>
              </div>` : ''}
            <div class="field">
              <label for="f-email">E-posta</label>
              <input id="f-email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="field">
              <label for="f-pass">Şifre</label>
              <input id="f-pass" name="password" type="password" minlength="6"
                     autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required>
            </div>
            <p class="error" id="auth-error" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit" id="auth-submit">
              ${mode === 'signup' ? 'Hesap oluştur' : 'Giriş yap'}
            </button>
            ${mode === 'login' ? `<p class="small" style="margin-top:12px;text-align:center">
              <a href="#" id="forgot">Şifremi unuttum</a></p>` : `
              <p class="consent-note">Hesap oluşturarak kişisel verilerinin hesabını yönetmek amacıyla
              işlenmesini kabul edersin. Eklediğin adayların verisini yalnızca sen görürsün.</p>`}
          </form>
        </section>
      </main>`;

    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    root.querySelector('#auth-form').addEventListener('submit', onSubmit);
    root.querySelector('#forgot')?.addEventListener('click', onForgot);
  };

  const setError = msg => { root.querySelector('#auth-error').textContent = msg || ''; };

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    // form.name formun kendi özelliğiyle çakışır; alanları elements üzerinden oku
    const field = key => form.elements.namedItem(key);
    const email = field('email').value.trim();
    const password = field('password').value;
    const name = field('name')?.value.trim();

    // Girdi kontrolü: boş alanla ilerleme
    if (mode === 'signup' && !name) return setError('Adını yaz.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Geçerli bir e-posta adresi gir.');
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
    setError('');

    const btn = form.querySelector('#auth-submit');
    btn.disabled = true;
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw error;
        if (!data.session) {
          root.querySelector('.auth-card').innerHTML = `
            <div class="empty">
              <i class="ti ti-mail-check" aria-hidden="true"></i>
              <h2>E-postanı kontrol et</h2>
              <p class="muted">${esc(email)} adresine bir onay bağlantısı gönderdik.
              Bağlantıya tıkladıktan sonra buraya dönüp giriş yapabilirsin.</p>
              <button class="btn btn-ghost" id="back">Giriş ekranına dön</button>
            </div>`;
          root.querySelector('#back').addEventListener('click', () => { mode = 'login'; draw(); });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(trError(err));
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  }

  async function onForgot(e) {
    e.preventDefault();
    const email = root.querySelector('#f-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Önce e-posta adresini yaz.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return setError(trError(error));
    setError('');
    toast('Şifre sıfırlama bağlantısı e-postana gönderildi.');
  }

  draw();
}
