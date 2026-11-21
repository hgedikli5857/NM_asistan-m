// WhatsApp bağlantıları: telefonda iki WhatsApp varsa (normal / Business) hangisinin açılacağını seçtirir.
const PREF = 'nmd_wa_app';
export const WA_APPS = {
  auto: { label: 'Telefon karar versin', pkg: null },
  wa: { label: 'WhatsApp (normal)', pkg: 'com.whatsapp' },
  w4b: { label: 'WhatsApp Business', pkg: 'com.whatsapp.w4b' }
};

export function getWaApp() {
  try { const v = localStorage.getItem(PREF); return WA_APPS[v] ? v : 'auto'; } catch { return 'auto'; }
}
export function setWaApp(v) {
  try { localStorage.setItem(PREF, WA_APPS[v] ? v : 'auto'); } catch { /* depolama kapalı */ }
}

const isAndroid = (ua = globalThis.navigator?.userAgent || '') => /Android/i.test(ua);

// num: yalnızca rakam (ülke koduyla), text: isteğe bağlı
export function waUrl(num, text = '', { app = getWaApp(), ua } = {}) {
  const n = String(num || '').replace(/\D/g, '');
  const pkg = WA_APPS[app]?.pkg;
  const web = `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  if (!pkg || !isAndroid(ua)) return web;
  const q = [n && `phone=${n}`, text && `text=${encodeURIComponent(text)}`].filter(Boolean).join('&');
  return `intent://send/?${q}#Intent;scheme=whatsapp;package=${pkg};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// Kod içinden açarken (buton tıklaması): intent bağlantıları yeni sekmede değil, aynı sayfadan tetiklenmeli
export function openWa(num, text = '') {
  const url = waUrl(num, text);
  if (url.startsWith('intent:')) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

// <a> için öznitelikler: intent bağlantısı yeni sekmede açılırsa boş sekme kalır
export function waAttrs(num, text = '') {
  const url = waUrl(num, text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return url.startsWith('intent:') ? `href="${url}"` : `href="${url}" target="_blank" rel="noopener"`;
}
