// Ortak AI istemcisi: önce sunucu (Supabase Edge Function 'ai'), yoksa bu cihazdaki kişisel anahtar.
import { supabase } from '../supabase.js';

export const AI_KEY = 'nmd_anthropic_key';
const LEGACY_AI_KEY = 'nma_api_key';
const CONSENT_KEY = 'nmd_ai_share_prospects';
const MODEL = 'claude-haiku-5-5';

export const getApiKey = () => localStorage.getItem(AI_KEY) || localStorage.getItem(LEGACY_AI_KEY) || '';

let serverStatus = null; // 'ok' | 'no_key' | 'error'

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (!error) return { data };
  let payload = {};
  try { payload = await error.context?.json(); } catch { /* yanıt gövdesi yok */ }
  return { error: payload?.error || 'network', message: payload?.message, limit: payload?.limit };
}

// Kullanım hakkı harcamadan sunucunun hazır olup olmadığını öğren (boş istek → anahtar varsa 'bad_request')
export async function serverReady() {
  if (serverStatus) return serverStatus === 'ok';
  const r = await invoke({ messages: [] });
  serverStatus = r.error === 'bad_request' ? 'ok' : r.error === 'no_server_key' ? 'no_key' : 'error';
  return serverStatus === 'ok';
}

export async function aiAvailable() {
  return (await serverReady()) || !!getApiKey();
}

export async function aiChat({ system, messages, maxTokens = 500 }) {
  if (await serverReady()) {
    const r = await invoke({ system, messages, max_tokens: maxTokens });
    if (r.data?.text) return r.data.text;
    if (r.error === 'limit') throw new Error(`Bugünkü AI kullanım hakkın doldu (${r.limit}). Yarın yenilenir.`);
    if (r.error !== 'no_server_key') throw new Error(r.message || 'AI sunucusu yanıt vermedi.');
    serverStatus = 'no_key';
  }
  const key = getApiKey();
  if (!key) throw new Error('AI henüz kurulmadı. Ayarlar → AI asistan bölümüne bak.');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, ...(system ? { system } : {}), messages })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  if (!text) throw new Error('Boş yanıt geldi');
  return text;
}

// AI metninden ilk JSON nesnesini ya da dizisini çıkar (```json blokları dahil)
export function extractJSON(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const starts = [s.indexOf('{'), s.indexOf('[')].filter(i => i >= 0);
  if (!starts.length) throw new Error('AI yanıtı anlaşılamadı');
  const start = Math.min(...starts);
  const open = s[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error('AI yanıtı yarım kaldı');
}

// Aday bilgisini AI'ya göndermeden önce bir kez açık onay
export function hasShareConsent() { return localStorage.getItem(CONSENT_KEY) === '1'; }
export function setShareConsent(v) { if (v) localStorage.setItem(CONSENT_KEY, '1'); else localStorage.removeItem(CONSENT_KEY); }
export function ensureShareConsent() {
  if (hasShareConsent()) return true;
  const ok = window.confirm(
    'AI önerisi için adayın adı, aşaması, etiketleri ve notları Anthropic\'in (ABD) Claude hizmetine gönderilecek.\n\n' +
    'Notlarına sağlık bilgisi gibi hassas veri yazmadıysan devam edebilirsin. Bu onayı Ayarlar\'dan geri alabilirsin.\n\nOnaylıyor musun?');
  if (ok) setShareConsent(true);
  return ok;
}

export const firstName = n => String(n || '').replace(/^[^\p{L}\d]+/u, '').trim().split(/\s+/)[0] || '';

// AI'ya gönderilecek kısa aday özeti (telefon, Instagram gönderilmez)
export function prospectBrief(p, now = new Date()) {
  const days = p.last_contact_at ? Math.floor((now - new Date(p.last_contact_at)) / 864e5) : null;
  return [
    `Ad: ${firstName(p.full_name)}`,
    `Aşama: ${p.stage}`, `Sıcaklık: ${p.temperature}`,
    p.tags?.length ? `Etiketler: ${p.tags.join(', ')}` : '',
    p.occupation ? `Meslek: ${p.occupation}` : '',
    p.interests ? `İlgi: ${p.interests}` : '',
    p.notes ? `Not: ${String(p.notes).slice(0, 300)}` : '',
    days === null ? 'Henüz temas yok' : `Son temas: ${days} gün önce`
  ].filter(Boolean).join(' | ');
}

export const ETHICS = `Etik ve marka kuralları (kesinlikle uy): "network marketing", "MLM", "çok katmanlı" deme, yalnızca "bireysel girişimcilik" de; kazanç, gelir, rakam, prim, hacim yok; sağlık iddiası yok (tedavi, iyileşme, hastalık adı yok), ürün "patch" diye anılır, "bant" değil; abartı, "garanti" ve baskı veren aciliyet yok; mesaj sonunda kolay bir çıkış bırak. Yeni kişiye "siz" diye hitap et. Mesajlar kısa (en fazla 3 cümle), sade, samimi, Türkçe.`;
