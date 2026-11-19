// Uygulamanın giriş noktası: oturum, menü (kabuk) ve sayfa yönlendirme
import { supabase, loadContext } from './supabase.js';
import { UNITS } from './units.js';
import { esc, toast, trError } from './ui.js';
import { renderAuth } from './views/giris.js';
import { renderPanel } from './views/panel.js';
import { renderUnit } from './views/birim.js';
import { renderSettings } from './views/ayarlar.js';

const root = document.getElementById('app');
let ctx = null;          // { user, profile, membership, org }
let recoveryMode = false; // şifre sıfırlama bağlantısından gelindi mi?

// ---------- Kabuk (menü + içerik alanı) ----------
const NAV = [
  { id: '', title: 'Panel', icon: 'ti-layout-dashboard' },
  ...UNITS.map(u => ({ id: u.id, title: u.title, icon: u.icon, phase: u.phase })),
  { id: 'ayarlar', title: 'Ayarlar', icon: 'ti-settings' }
];
// Mobil alt çubukta 5 sekme sığar
const MOBILE_NAV = ['', 'kazanim', 'iletisim', 'ekip', 'ayarlar'];

function renderShell() {
  const name = ctx.profile?.full_name || ctx.user.email;
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Ana menü">
        <div class="brand">
          <div class="logo-mark" aria-hidden="true">NM</div>
          <div><strong>NM Departmanı</strong><span>${esc(ctx.org?.name || '')}</span></div>
        </div>
        <nav>
          ${NAV.map(n => `<a class="nav-link" href="#/${n.id}" data-route="${n.id}">
            <i class="ti ${n.icon}" aria-hidden="true"></i>${esc(n.title)}
            ${n.phase ? `<span class="pill">F${n.phase}</span>` : ''}</a>`).join('')}
        </nav>
        <div class="spacer"></div>
        <div class="user"><div class="name">${esc(name)}</div>
          <div>${esc(ctx.profile?.career_level || '')}</div></div>
      </aside>

      <header class="topbar">
        <div class="logo-mark" aria-hidden="true">NM</div>
        <strong>NM Departmanı</strong>
      </header>

      <main class="main" id="view" tabindex="-1"></main>

      <nav class="bottombar" aria-label="Alt menü">
        ${MOBILE_NAV.map(id => NAV.find(n => n.id === id)).map(n => `
          <a href="#/${n.id}" data-route="${n.id}"><i class="ti ${n.icon}" aria-hidden="true"></i>${esc(n.title)}</a>`).join('')}
      </nav>
    </div>`;
}

// ---------- Yönlendirme (#/kazanim gibi) ----------
function currentRoute() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

async function route() {
  if (!ctx) return;
  const id = currentRoute();
  const view = document.getElementById('view');
  if (!view) return;

  document.querySelectorAll('[data-route]').forEach(a => {
    if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    if (id === '') await renderPanel(view, ctx);
    else if (id === 'ayarlar') renderSettings(view, ctx, { recovery: recoveryMode });
    else renderUnit(view, id);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card empty"><i class="ti ti-alert-triangle" aria-hidden="true"></i>
      <h2>Sayfa yüklenemedi</h2><p class="muted">${esc(trError(err))}</p></div>`;
  }
  recoveryMode = false;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- Oturum ----------
async function start(session) {
  if (!session) {
    ctx = null;
    renderAuth(root);
    return;
  }
  try {
    ctx = await loadContext();
  } catch (err) {
    root.innerHTML = `<div class="auth-wrap"><div class="card empty" style="max-width:420px">
      <i class="ti ti-cloud-off" aria-hidden="true"></i><h2>Bağlanılamadı</h2>
      <p class="muted">${esc(trError(err))}</p>
      <button class="btn btn-primary" onclick="location.reload()">Tekrar dene</button></div></div>`;
    return;
  }
  if (!ctx?.org) {
    root.innerHTML = `<div class="auth-wrap"><div class="card empty" style="max-width:420px">
      <i class="ti ti-users" aria-hidden="true"></i><h2>Ekip bulunamadı</h2>
      <p class="muted">Hesabına bağlı bir ekip yok. Lütfen yöneticinle iletişime geç.</p></div></div>`;
    return;
  }
  renderShell();
  route();
}

let lastUserId;
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    location.hash = '#/ayarlar';
    toast('Yeni şifreni belirle.');
  }
  // Aynı kullanıcı için token yenilemelerinde ekranı baştan çizme
  const uid = session?.user?.id || null;
  if (event === 'TOKEN_REFRESHED' || (event === 'USER_UPDATED' && uid === lastUserId)) return;
  if (event === 'INITIAL_SESSION' || uid !== lastUserId || event === 'SIGNED_OUT') {
    lastUserId = uid;
    // Supabase dinleyicisi içinde başka Supabase çağrısını beklememek için bir sonraki tura bırak
    setTimeout(() => start(session), 0);
  }
});

window.addEventListener('hashchange', route);
document.addEventListener('ctx:changed', () => { renderShell(); route(); });

// ---------- Çevrimdışı önbellek (PWA) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker kaydedilemedi', err));
}
