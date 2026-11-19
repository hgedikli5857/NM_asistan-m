// Uygulamanın giriş noktası: oturum, menü (kabuk), ekip seçimi ve sayfa yönlendirme
import { supabase, loadContext, setActiveOrg } from './supabase.js';
import { UNITS } from './units.js';
import { esc, toast, trError } from './ui.js';
import { renderAuth } from './views/giris.js';
import { renderPanel } from './views/panel.js';
import { renderUnit } from './views/birim.js';
import { renderSettings } from './views/ayarlar.js';
import { renderKazanim } from './views/kazanim.js';
import { renderIletisim } from './views/iletisim.js';
import { renderOlcum } from './views/olcum.js';
import { renderEkip } from './views/ekip.js';
import { renderAkademi } from './views/akademi.js';
import { renderPazarlama } from './views/pazarlama.js';
import { renderKoc } from './views/koc.js';
import { renderDavet, inviteCodeFromHash, PENDING_INVITE } from './views/davet.js';

const root = document.getElementById('app');
let ctx = null;           // { user, profile, memberships, membership, org }
let recoveryMode = false; // şifre sıfırlama bağlantısından gelindi mi?

// Davet linkiyle gelindiyse kodu sakla (giriş/kayıt sonrası kullanılacak)
const initialInvite = inviteCodeFromHash();
if (initialInvite) localStorage.setItem(PENDING_INVITE, initialInvite);

// ---------- Sayfalar ----------
const ROUTES = {
  '': (p) => renderPanel(p, ctx),
  ayarlar: (p) => renderSettings(p, ctx, { recovery: recoveryMode }),
  kazanim: (p) => renderKazanim(p, ctx),
  iletisim: (p) => renderIletisim(p, ctx),
  olcum: (p) => renderOlcum(p, ctx),
  ekip: (p) => renderEkip(p, ctx),
  akademi: (p) => renderAkademi(p, ctx),
  pazarlama: (p) => renderPazarlama(p, ctx),
  koc: (p) => renderKoc(p, ctx)
};

// ---------- Kabuk (menü + içerik alanı) ----------
const NAV = [
  { id: '', title: 'Panel', icon: 'ti-layout-dashboard' },
  { id: 'koc', title: 'Koç', icon: 'ti-sparkles' },
  ...UNITS.map(u => ({ id: u.id, title: u.title, short: u.short, icon: u.icon })),
  { id: 'ayarlar', title: 'Ayarlar', icon: 'ti-settings' }
];
const MOBILE_NAV = ['', 'kazanim', 'iletisim', 'koc'];

function orgSwitcher(id) {
  if (ctx.memberships.length < 2) return `<span>${esc(ctx.org?.name || '')}</span>`;
  return `<label class="sr-only" for="${id}">Aktif ekip</label>
    <select id="${id}" class="org-switch" data-org-switch>
      ${ctx.memberships.map(m => `<option value="${m.org.id}" ${m.org.id === ctx.org.id ? 'selected' : ''}>${esc(m.org.name)}</option>`).join('')}
    </select>`;
}

function renderShell() {
  const name = ctx.profile?.full_name || ctx.user.email;
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Ana menü">
        <div class="brand">
          <div class="logo-mark" aria-hidden="true">NM</div>
          <div><strong>NM Departmanı</strong>${orgSwitcher('org-switch-side')}</div>
        </div>
        <nav>
          ${NAV.map(n => `<a class="nav-link" href="#/${n.id}" data-route="${n.id}">
            <i class="ti ${n.icon}" aria-hidden="true"></i>${esc(n.title)}</a>`).join('')}
        </nav>
        <div class="spacer"></div>
        <div class="user"><div class="name">${esc(name)}</div>
          <div>${esc(ctx.profile?.career_level || '')} · ${esc(roleName(ctx.membership?.role))}</div></div>
      </aside>

      <header class="topbar">
        <div class="logo-mark" aria-hidden="true">NM</div>
        <strong>NM Departmanı</strong>
        <div class="topbar-org">${orgSwitcher('org-switch-top')}</div>
      </header>

      <main class="main" id="view" tabindex="-1"></main>

      <nav class="bottombar" aria-label="Alt menü">
        ${MOBILE_NAV.map(id => NAV.find(n => n.id === id)).map(n => `
          <a href="#/${n.id}" data-route="${n.id}"><i class="ti ${n.icon}" aria-hidden="true"></i>${esc(n.short || n.title)}</a>`).join('')}
        <button type="button" data-open-menu aria-haspopup="dialog"><i class="ti ti-menu-2" aria-hidden="true"></i>Menü</button>
      </nav>

      <dialog class="sheet menu-sheet" id="menu-sheet" aria-label="Tüm birimler">
        <div class="sheet-head"><h2>Menü</h2>
          <button type="button" class="icon-btn" data-close-menu aria-label="Kapat"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <nav class="sheet-body menu-grid">
          ${NAV.map(n => `<a href="#/${n.id}" data-route="${n.id}"><i class="ti ${n.icon}" aria-hidden="true"></i><span>${esc(n.title)}</span></a>`).join('')}
        </nav>
      </dialog>
    </div>`;

  root.querySelectorAll('[data-org-switch]').forEach(sel => sel.addEventListener('change', e => {
    setActiveOrg(e.target.value);
    reloadContext().then(() => toast(`Aktif ekip: ${ctx.org.name}`));
  }));
  const menu = root.querySelector('#menu-sheet');
  root.querySelector('[data-open-menu]').addEventListener('click', () => menu.showModal());
  root.querySelector('[data-close-menu]').addEventListener('click', () => menu.close());
  menu.addEventListener('click', e => { if (e.target.closest('a') || e.target === menu) menu.close(); });
}

function roleName(role) {
  return { owner: 'Ekip sahibi', leader: 'Lider', member: 'Üye' }[role] || '';
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
  const base = id.split('/')[0];

  document.querySelectorAll('[data-route]').forEach(a => {
    if (a.dataset.route === base) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // Her sayfa yeni bir kapta çizilir; eski sayfanın olay dinleyicileri onunla birlikte silinir
  view.innerHTML = '';
  const page = document.createElement('div');
  view.append(page);

  try {
    if (base === 'davet') await renderDavet(page, ctx, id.split('/')[1] || '');
    else if (ROUTES[base]) await ROUTES[base](page);
    else renderUnit(page, base);
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="card empty"><i class="ti ti-alert-triangle" aria-hidden="true"></i>
      <h2>Sayfa yüklenemedi</h2><p class="muted">${esc(trError(err))}</p></div>`;
  }
  recoveryMode = false;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function reloadContext() {
  ctx = await loadContext();
  renderShell();
  await route();
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
  // Giriş öncesi bir davet linkiyle gelindiyse davet sayfasına yönlendir
  const pending = localStorage.getItem(PENDING_INVITE);
  if (pending && currentRoute().split('/')[0] !== 'davet') location.hash = `#/davet/${pending}`;
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
document.addEventListener('ctx:reload', () => { reloadContext(); });

// ---------- Çevrimdışı önbellek (PWA) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker kaydedilemedi', err));
}
