// Davet linkiyle gelen kullanıcının ekibe katılması: #/davet/<kod>
import { supabase, setActiveOrg } from '../supabase.js';
import { esc, trError } from '../ui.js';

export const PENDING_INVITE = 'nmd_pending_invite';

export function inviteCodeFromHash() {
  const m = /^#\/davet\/([a-f0-9]{8,40})/i.exec(location.hash);
  return m ? m[1].toLowerCase() : null;
}

export async function renderDavet(el, ctx, code) {
  localStorage.removeItem(PENDING_INVITE);
  const { data, error } = await supabase.rpc('invitation_info', { p_code: code });
  const info = data?.[0];
  if (error || !info) {
    el.innerHTML = box('ti-link-off', 'Davet bulunamadı', 'Bağlantı hatalı olabilir. Seni davet eden kişiden yeni bir link iste.');
    return;
  }
  if (info.already_member) {
    el.innerHTML = box('ti-users', `Zaten ${esc(info.org_name)} ekibindesin`, '', `<button class="btn btn-primary" id="go">Ekibe geç</button>`);
    el.querySelector('#go').addEventListener('click', () => switchTo(code));
    return;
  }
  if (!info.valid) {
    el.innerHTML = box('ti-clock-off', 'Davetin süresi dolmuş', 'Bu davet kullanılmış ya da süresi dolmuş. Yeni bir link iste.');
    return;
  }
  el.innerHTML = box('ti-users-plus', `${esc(info.org_name)} seni bekliyor`,
    `${esc(info.inviter_name || 'Bir lider')} seni ekibine <strong>${info.role === 'leader' ? 'lider' : 'üye'}</strong> olarak davet etti.
     Katıldığında ekip etkinliklerini, paylaşılan şablonları ve sıralamayı görürsün. Adayların yine yalnızca sana ait kalır.`,
    `<button class="btn btn-gold" id="join"><i class="ti ti-check" aria-hidden="true"></i> Ekibe katıl</button>
     <a class="btn btn-ghost" href="#/">Şimdi değil</a><p class="error" id="join-err" role="alert"></p>`);
  el.querySelector('#join').addEventListener('click', () => switchTo(code));

  async function switchTo(c) {
    const btn = el.querySelector('#join, #go');
    if (btn) btn.disabled = true;
    const { data: orgId, error: e2 } = await supabase.rpc('accept_invitation', { p_code: c });
    if (e2) {
      const err = el.querySelector('#join-err');
      if (err) err.textContent = trError(e2);
      if (btn) btn.disabled = false;
      return;
    }
    setActiveOrg(orgId);
    location.hash = '#/ekip';
    document.dispatchEvent(new CustomEvent('ctx:reload'));
  }
}

function box(icon, title, text, actions = '') {
  return `<div class="card empty" style="max-width:520px;margin:40px auto">
    <i class="ti ${icon}" aria-hidden="true"></i><h2>${title}</h2>
    ${text ? `<p class="muted">${text}</p>` : ''}<div class="quick" style="justify-content:center">${actions}</div></div>`;
}
