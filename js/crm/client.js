// WhatsApp bot CRM (crm-panel) köprüsü — istemci tarafı
// Token tarayıcıya hiç gelmez; tüm erişim 'crm' Edge Function üzerinden.
import { supabase } from '../supabase.js';
import { esc } from '../ui.js';

const AUTO_KEY = 'nmd_crm_auto_at';
export const AUTO_MINUTES = 30;

export async function crmStatus() {
  const { data, error } = await supabase.rpc('crm_status');
  if (error) return { linked: false };
  return data || { linked: false };
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('crm', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); msg = j?.message || j?.error || msg; } catch { /* yok */ }
    throw new Error(msg);
  }
  return data;
}

export async function crmSync() {
  const data = await call({ action: 'sync' });
  localStorage.setItem(AUTO_KEY, String(Date.now()));
  return data.result;
}

export async function crmMessages(prospectId, limit = 60) {
  const data = await call({ action: 'messages', prospect_id: prospectId, limit });
  return data.messages || [];
}

// Son otomatik senkrondan beri yeterli süre geçti mi?
export function autoSyncDue(now = Date.now(), last = Number(localStorage.getItem(AUTO_KEY) || 0)) {
  return now - last > AUTO_MINUTES * 60 * 1000;
}

// Arka planda sessiz senkron; yeni/ güncel kayıt varsa sonucu döner
export async function crmAutoSync() {
  if (!autoSyncDue()) return null;
  localStorage.setItem(AUTO_KEY, String(Date.now()));
  const st = await crmStatus();
  if (!st.linked) return null;
  try { return await crmSync(); } catch { return null; }
}

export function resultText(r) {
  if (!r) return '';
  const parts = [];
  if (r.yeni) parts.push(`${r.yeni} yeni aday`);
  if (r.guncellenen) parts.push(`${r.guncellenen} güncellendi`);
  if (r.telefonla_eslesen) parts.push(`${r.telefonla_eslesen} mevcut adayla eşleşti`);
  if (r.atlanan_korunan) parts.push(`${r.atlanan_korunan} korunan kişi atlandı`);
  return parts.join(' · ') || 'Değişiklik yok';
}

// Bot'un sana devrettiği ya da okunmamış mesajı olan adaylar (en yeni mesaj üstte)
export function crmWaiting(prospects) {
  return prospects
    .filter(p => {
      const c = p.extra?.crm?.conv;
      return c && (c.handoff_status === 'bekliyor' || (c.unread_count > 0 && c.handler === 'human'));
    })
    .sort((a, b) => new Date(b.extra.crm.conv.last_message_at || 0) - new Date(a.extra.crm.conv.last_message_at || 0));
}

const HANDOFF = { bekliyor: 'Sana devredildi — cevap bekliyor', ustlenildi: 'Sen üstlendin', cozuldu: 'Çözüldü' };
const METHOD = { yuz_yuze: 'Yüz yüze', whatsapp_goruntulu: 'WhatsApp görüntülü', zoom: 'Zoom' };

// Aday kartındaki CRM özeti
export function crmSummaryHTML(crm, prospectId) {
  if (!crm) return '';
  const c = crm.conv || {};
  const rows = [];
  if (c.handoff_status && HANDOFF[c.handoff_status]) {
    rows.push(`<span class="badge ${c.handoff_status === 'bekliyor' ? 'warn' : ''}">${HANDOFF[c.handoff_status]}</span>`);
  }
  rows.push(`<span class="badge">${c.handler === 'human' ? 'Sen yönetiyorsun' : 'Bot yönetiyor'}</span>`);
  if (c.unread_count) rows.push(`<span class="badge gold">${c.unread_count} okunmamış</span>`);
  const lines = [];
  if (c.meeting_start) {
    lines.push(`<i class="ti ti-calendar-event" aria-hidden="true"></i> Görüşme: ${esc(fmt(c.meeting_start))}${c.meeting_method ? ' · ' + esc(METHOD[c.meeting_method] || c.meeting_method) : ''}`);
  }
  if (c.last_message_at) {
    lines.push(`<i class="ti ti-clock" aria-hidden="true"></i> Son mesaj: ${esc(fmt(c.last_message_at))}${c.preview ? ' — “' + esc(c.preview) + '”' : ''}`);
  }
  if (crm.source) lines.push(`<i class="ti ti-target-arrow" aria-hidden="true"></i> Bot kaynağı: ${esc(crm.source)}`);
  return `<div class="card crm-card">
    <h3><i class="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp bot konuşması</h3>
    <div class="chips">${rows.join(' ')}</div>
    ${lines.map(l => `<p class="small">${l}</p>`).join('')}
    <button class="btn btn-ghost" type="button" data-act="crm-msgs" data-id="${esc(prospectId)}">
      <i class="ti ti-messages" aria-hidden="true"></i> Konuşmayı göster${c.msg_count ? ` (${c.msg_count})` : ''}</button>
    <div class="crm-msgs" id="crm-msgs" hidden></div>
  </div>`;
}

const WHO = { lead: 'Aday', bot: 'Bot', insan: 'Sen', sistem: 'Sistem' };
export function messagesHTML(msgs) {
  if (!msgs.length) return '<p class="muted small">Mesaj bulunamadı.</p>';
  return `<ol class="chat">${msgs.map(m => `
    <li class="msg ${m.direction === 'gelen' ? 'in' : 'out'}">
      <span class="who">${esc(WHO[m.sender_type] || m.sender_type)} · ${esc(fmt(m.created_at))}</span>
      <span class="body">${m.body ? esc(m.body) : `<em class="muted">[${esc(m.content_type || 'medya')}]</em>`}</span>
    </li>`).join('')}</ol>`;
}

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- Cevap öner için konuşma yardımcıları ----
const WHO_P = { lead: 'Kişi', bot: 'Bot', insan: 'Ben', sistem: 'Sistem' };

// AI'ya verilecek kısa yazışma dökümü (eskiden yeniye, son `max` mesaj)
export function transcript(msgs, max = 20) {
  return (msgs || []).filter(m => m.sender_type !== 'sistem').slice(-max).map(m => {
    const who = m.direction === 'gelen' ? 'Kişi' : (WHO_P[m.sender_type] || 'Ben');
    const body = m.body ? String(m.body).replace(/\s+/g, ' ').slice(0, 400) : `[${m.content_type || 'medya'}]`;
    return `${who}: ${body}`;
  }).join('\n');
}

// Son gelen mesajın zamanı (24 saat penceresi için)
export function lastIncoming(msgs) {
  const t = (msgs || []).filter(m => m.direction === 'gelen').map(m => m.created_at).sort().pop();
  return t || null;
}

// Son mesaj kişiden mi geldi? (cevap bekliyor)
export function awaitingReply(msgs) {
  const real = (msgs || []).filter(m => m.sender_type !== 'sistem');
  return real.length ? real[real.length - 1].direction === 'gelen' : false;
}

// Son yazanlar: CRM konuşması olan, en son mesajı en yeni kişiler
export function recentWriters(prospects, limit = 6) {
  return prospects
    .filter(p => p.extra?.crm?.conv?.last_message_at)
    .sort((a, b) => new Date(b.extra.crm.conv.last_message_at) - new Date(a.extra.crm.conv.last_message_at))
    .slice(0, limit);
}
