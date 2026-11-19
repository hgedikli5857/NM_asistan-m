// Küçük yardımcılar: güvenli metin, bildirim, tarih.

// Kullanıcıdan gelen metni HTML'e koymadan önce mutlaka buradan geçir (XSS koruması).
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export function todayLong(date = new Date()) {
  return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Supabase hata mesajlarını Türkçeleştir.
export function trError(err) {
  const msg = (err && (err.message || err.error_description)) || String(err);
  const map = [
    [/Invalid login credentials/i, 'E-posta veya şifre hatalı.'],
    [/Email not confirmed/i, 'E-postanı henüz onaylamadın. Gelen kutunu kontrol et.'],
    [/User already registered/i, 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.'],
    [/Password should be at least/i, 'Şifre en az 6 karakter olmalı.'],
    [/rate limit|too many/i, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.'],
    [/Failed to fetch|NetworkError/i, 'İnternet bağlantısı yok gibi görünüyor.'],
    [/Unable to validate email|invalid format/i, 'Geçerli bir e-posta adresi gir.']
  ];
  for (const [re, tr] of map) if (re.test(msg)) return tr;
  return 'Bir hata oluştu: ' + msg;
}
