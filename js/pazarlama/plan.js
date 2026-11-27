// İçerik fabrikası: 30 günlük plan motoru. Haftada 3 Reels + 3 Karusel + 3 Gönderi, pazar değerlendirme günü.
// Saf fonksiyonlar (Node testlerinde de çalışır). Konular uyumlu dilde: kazanç vaadi ve sağlık iddiası yok.
import { PILLARS } from './content.js';

// getDay(): 0 = pazar … 6 = cumartesi
export const WEEK_PATTERN = {
  1: ['reels', 'gonderi'],
  2: ['karusel'],
  3: ['reels'],
  4: ['gonderi', 'karusel'],
  5: ['reels'],
  6: ['karusel', 'gonderi'],
  0: []
};
export const PLAN_FORMATS = ['reels', 'karusel', 'gonderi'];
export const DEFAULT_TIME = '07:45';

// Üretim araçları (dış araçlarda: aracı aç, brief'i kopyala, bitmiş dosyayı yükle)
export const TOOLS = {
  uygulama: { label: 'Uygulamada üret', icon: 'ti-device-mobile', url: '' },
  canva: { label: 'Canva', icon: 'ti-palette', url: 'https://www.canva.com/' },
  higgsfield: { label: 'Higgsfield', icon: 'ti-sparkles', url: 'https://higgsfield.ai/' },
  kling: { label: 'Kling AI', icon: 'ti-movie', url: 'https://app.klingai.com/' },
  capcut: { label: 'CapCut', icon: 'ti-cut', url: 'https://www.capcut.com/' },
  diger: { label: 'Başka bir araç', icon: 'ti-upload', url: '' }
};

// Konu bankası (sütun → konular). Her konu Reels, Karusel ya da Gönderi olarak işlenebilir.
export const TOPIC_BANK = {
  yasam: ['Sabah rutinim', 'Mesai sonrası akşamlarım', 'Bu ay okuduğum kitap', 'Haftanın dersi', 'Küçük alışkanlıklar büyük farklar',
    'Telefonsuz bir saat', 'Haftalık planlama anım', 'Kendime ayırdığım zaman', 'Bu hafta öğrendiğim bir şey', 'Yürüyüş ve düşünme saati',
    'Pazar akşamı hazırlığım', 'Bir yılda neler değişti'],
  ogretici: ['Zaman planlama ipucu', '15 dakikalık ev düzeni rutini', 'Hedef koyarken yaptığım 3 şey', 'Erteleme ile nasıl başa çıkıyorum',
    'Günlük yapılacaklar listemi nasıl yazıyorum', 'Yeni bir alışkanlığı nasıl başlatırım', 'Odaklanma için ortam hazırlığı',
    'Haftalık değerlendirme nasıl yapılır', 'Kişisel bakım rutinimi sade tutmak', 'Mutfakta pratik temizlik düzeni', 'Not alma yöntemim',
    'İş ve özel hayat dengesi için sınırlar'],
  deneyim: ['Kullandığım ürünlerden biri', 'Çantamdan eksik etmediğim 3 şey', 'Evde temizlik rutinim', 'Kişisel bakım favorilerim',
    'Yeni denediğim ürün: ilk izlenim', 'Ürünü günlük rutine nasıl kattım', 'Ailemle paylaştığım ürün', 'Banyo rafımda neler var',
    'Seyahat çantam', 'En çok sorulan ürün sorusu'],
  etkilesim: ['Sabahçı mı akşamcı mı?', 'Bu haftayı tek kelimeyle anlat', 'Soru-cevap günü', 'Sen olsan hangisini seçerdin?',
    'Bu hafta neyi başardın?', 'En sevdiğin sabah içeceği', 'Bir alışkanlık önerin var mı?', 'Hafta sonu planın ne?'],
  ekip: ['Neden bu işi yapıyorum', 'Ekip eğitiminden bir kare', 'Yeni başlayan ekip arkadaşımıza hoş geldin', 'Online tanıtım duyurusu',
    'Birlikte öğrenmenin gücü', 'Bireysel girişimcilik nedir, ne değildir', 'İşimin yanında girişimcilik', 'Bir etkinlikten notlar']
};

// Sütunlara göre hashtag setleri (konuya özel). Marka kitindeki sabit etiketler bunlara eklenir.
export const PILLAR_TAGS = {
  yasam: ['#kişiselgelişim', '#alışkanlık', '#günlükrutin', '#motivasyon', '#sabahrutini', '#hedef'],
  ogretici: ['#ipucu', '#zamanyönetimi', '#verimlilik', '#planlama', '#öğreniyorum', '#pratikbilgi'],
  deneyim: ['#kişiselbakım', '#evdüzeni', '#günlükrutin', '#favorilerim', '#deneyim', '#öneri'],
  etkilesim: ['#sizce', '#sohbet', '#soru', '#paylaş', '#topluluk', '#hafta'],
  ekip: ['#girişimcilik', '#bireyselgirişimcilik', '#ekipçalışması', '#birlikteöğreniyoruz', '#eğitim', '#ilham']
};

const pad = n => String(n).padStart(2, '0');
export const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

// Sütun dağılımı: hedef yüzdelere en büyük kalan yöntemiyle, sonra aynı sütun art arda gelmeyecek şekilde serpiştir
export function pillarSequence(n, pillars = PILLARS) {
  if (n <= 0) return [];
  const raw = pillars.map(p => ({ id: p.id, exact: (p.share / 100) * n }));
  raw.forEach(r => { r.count = Math.floor(r.exact); r.rem = r.exact - r.count; });
  let left = n - raw.reduce((a, r) => a + r.count, 0);
  [...raw].sort((a, b) => b.rem - a.rem).forEach(r => { if (left > 0) { r.count++; left--; } });
  const out = [];
  const pool = raw.map(r => ({ ...r }));
  while (out.length < n) {
    const last = out[out.length - 1];
    const cand = pool.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
    const pick = cand.find(r => r.id !== last) || cand[0];
    out.push(pick.id); pick.count--;
  }
  return out;
}

// existing: mevcut içerikler [{planned_for, format, topic}]; aynı gün aynı formatta içerik varsa o boşluk atlanır
export function planDays({ start = new Date(), days = 30, existing = [], time = DEFAULT_TIME, bank = TOPIC_BANK, seed = 0 } = {}) {
  const taken = new Set(existing.map(p => `${p.planned_for}|${p.format}`));
  const usedTopics = new Set(existing.map(p => String(p.topic || '').toLocaleLowerCase('tr')));
  const slots = [];
  const s0 = new Date(start); s0.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(s0); d.setDate(d.getDate() + i);
    for (const format of WEEK_PATTERN[d.getDay()]) {
      const day = isoDay(d);
      if (!taken.has(`${day}|${format}`)) slots.push({ planned_for: day, format });
    }
  }
  const seq = pillarSequence(slots.length);
  const cursor = Object.fromEntries(Object.keys(bank).map((k, i) => [k, (seed + i * 3) % bank[k].length]));
  return slots.map((sl, i) => {
    const pillar = seq[i];
    const list = bank[pillar];
    let topic = list[cursor[pillar] % list.length], tries = 0;
    while (usedTopics.has(topic.toLocaleLowerCase('tr')) && tries++ < list.length) { cursor[pillar]++; topic = list[cursor[pillar] % list.length]; }
    cursor[pillar]++;
    usedTopics.add(topic.toLocaleLowerCase('tr'));
    return { ...sl, pillar, topic, post_time: time, platform: 'Instagram', status: 'fikir', auto_planned: true, tool: 'uygulama' };
  });
}

// Haftalık kota durumu: [{week: 'YYYY-MM-DD' (pazartesi), reels, karusel, gonderi}]
export function weeklyQuota(posts, { start = new Date(), days = 30 } = {}) {
  const s0 = new Date(start); s0.setHours(0, 0, 0, 0);
  const end = new Date(s0); end.setDate(end.getDate() + days);
  const monday = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoDay(x); };
  const weeks = new Map();
  for (let d = new Date(s0); d < end; d.setDate(d.getDate() + 7)) weeks.set(monday(d), { week: monday(d), reels: 0, karusel: 0, gonderi: 0, hazir: 0 });
  for (const p of posts) {
    if (!PLAN_FORMATS.includes(p.format)) continue;
    const d = fromIso(p.planned_for);
    if (d < s0 || d >= end) continue;
    const w = weeks.get(monday(d));
    if (!w) continue;
    w[p.format]++;
    if (p.status === 'hazir' || p.status === 'paylasildi') w.hazir++;
  }
  return [...weeks.values()];
}

// Konu + sütun + sabit etiketlerden hashtag satırı (en fazla 10, tekrarsız)
export function buildHashtags(pillar, fixed = '', extra = []) {
  const norm = t => { const x = String(t).trim().replace(/^#*/, ''); return x ? '#' + x.replace(/\s+/g, '').toLocaleLowerCase('tr') : ''; };
  const out = [];
  for (const t of [...String(fixed || '').split(/[\s,]+/), ...(PILLAR_TAGS[pillar] || []), ...extra].map(norm)) {
    if (t && t.length > 1 && !out.includes(t)) out.push(t);
    if (out.length >= 10) break;
  }
  return out.join(' ');
}

// Dış araç için kısa üretim brief'i (kopyalanıp Canva / Higgsfield / Kling / CapCut'a yapıştırılır)
export function toolBrief(post, { tool = 'diger', storyboard = null, brand = {} } = {}) {
  const fmt = { reels: 'Instagram Reels (9:16 dikey video, 15-30 sn)', karusel: 'Instagram karusel (4:5, 6-8 sayfa)', gonderi: 'Instagram gönderi (4:5 görsel)' }[post.format] || 'Instagram içeriği';
  const lines = [`Konu: ${post.topic}`, `Format: ${fmt}`];
  if (storyboard?.scenes?.length) {
    storyboard.scenes.forEach((sc, i) => {
      const t = [sc.top, sc.bot].filter(Boolean).join(' / ').replace(/\n/g, ' ');
      lines.push(`Sahne ${i + 1} (${String(sc.sec || 4).replace('.', ',')} sn): ${t}`);
    });
    if (storyboard.slogan) lines.push(`Slogan: ${storyboard.slogan.replace(/\n/g, ' ')}`);
    if (storyboard.cta) lines.push(`Kapanış: ${storyboard.cta} ${storyboard.kw || ''}`.trim());
  }
  const style = 'Görsel dil: lacivert ve altın tonlar, sade, sıcak gün ışığı, gerçekçi günlük yaşam sahneleri. Yazılar büyük ve okunur.';
  const rules = 'Kurallar: kazanç ya da gelir rakamı yok, sağlık/tedavi iddiası yok, gerçek kişi yüzü kullanılacaksa sadece benim çekimlerim.';
  const per = {
    canva: 'Canva: "Instagram Reels" ya da "Instagram gönderisi" şablonu aç, marka renklerini uygula, logoyu sağ alta koy.',
    higgsfield: 'Higgsfield: her sahne için ayrı 4-5 sn dikey klip üret; kamera hareketi yavaş ve doğal olsun.',
    kling: 'Kling: her sahne için 5 sn, 9:16 klip üret; sinematik ama gerçekçi.',
    capcut: 'CapCut: sahneleri sırala, yazıları altyazı olarak ekle, geçişleri sade tut.'
  }[tool];
  return [...lines, style, rules, per, brand.handle ? `Hesap: ${brand.handle}` : ''].filter(Boolean).join('\n');
}

export function aiTopicsPrompt(items) {
  return `Instagram için içerik konuları öner. Kişi: işinin yanında sağlık ve kişisel bakım alanında bireysel girişimcilik (doğrudan satış) yapan biri. Ton samimi, gerçekçi.
Yasaklar: kazanç/gelir/para rakamı, sağlık iddiası (tedavi, iyileşme, zayıflama), "network marketing" ve "MLM" kelimeleri, abartı.
Her satır için verilen formata ve içerik sütununa uygun, en fazla 60 karakterlik, birbirini tekrar etmeyen bir konu yaz.
${items.map((x, i) => `${i + 1}. ${x.planned_for} · ${x.format} · ${x.pillar}`).join('\n')}
Sadece JSON döndür: {"topics":["...", "..."]} (sıra ve sayı aynı olsun)`;
}
