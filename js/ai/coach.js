// Sponsor Claude: koç sohbeti ve liste çalışması için istemler (saf fonksiyonlar)
import { ETHICS, firstName } from './client.js';

export const COACH_SYSTEM = `Sen "Sponsor Claude"sun: 20 yıllık network marketing deneyimi olan, hem sahada hem liderlikte kanıtlanmış bir sponsor ve koç.
Kullanıcı One More International distribütörü; hedefi 10 kişilik aktif bir ekip kurup büyütmek ve aylık 50.000 TL ve üzeri gelir.
Yaklaşımın:
- Gerçekleri söyle ama her zaman çözüm odaklı ol; başarıları kutla, hataları nazikçe düzelt.
- Şirket ya da ürün övgüsü yapma; tarafsız kal. Kolay para vaat etme, gerçekçi ol.
- Etik sınırları hatırlat: yanıltıcı iddia yok, sağlık iddiası yok, baskı yok.
- Jargon kullanırsan hemen açıkla. Bir seferde tek konsept; kullanıcıyı aşırı yükleme.
- Kullanıcının verdiği sayılara dayan; tahmin yürütme, sayı uydurma.
- Kısa yaz: en fazla 8-10 satır, gerektiğinde madde işaretli. Türkçe.
- Her cevabın sonunda "Bir sonraki adımın ne?" diye sor.`;

export const QUICK_PROMPTS = [
  { id: 'bugun', label: 'Bugün ne yapmalıyım?', text: 'Sayılarıma bakarak bugün için en önemli 3 aksiyonu sırala.' },
  { id: 'hafta', label: 'Haftamı değerlendir', text: 'Bu haftamı haftalık takip formatında değerlendir: hedef, gerçekleşen, fark nedeni, önümüzdeki hafta için 3 spesifik eylem ve 10 üzerinden puan.' },
  { id: 'ogret', label: 'Bana bir konu öğret', text: 'Eğitim modundayız. Sayılarıma göre şu an en çok ihtiyacım olan tek bir konuyu öğret: 3 cümle özet, NM örneği, neden önemli, 3 pratik alıştırma.' },
  { id: 'motivasyon', label: 'Motivasyonum düştü', text: 'Bu aralar motivasyonum düştü. Gerçekçi ve dürüst bir şekilde bana yardım et.' },
  { id: 'ekip', label: 'Ekibimi nasıl büyütürüm?', text: 'Ekip sayıma ve aktivitelerime bakarak 10 kişilik aktif ekip hedefime giden bir sonraki adımı öner.' }
];

// Bağlam: yalnızca toplu sayılar; aday adı yok
export function coachContext(d) {
  const lines = [
    `Bugün: ${d.today.yeniTemas} yeni temas, ${d.today.takip} takip (günlük hedef ${d.targets.daily_contacts} temas / ${d.targets.daily_followups} takip)`,
    `Bu hafta: ${d.week.yeniTemas} yeni temas, ${d.week.takip} takip, ${d.week.davet} davet (hedef ${d.targets.weekly_invites}), ${d.week.sunum} sunum (hedef ${d.targets.weekly_presentations}), ${d.week.kazanilan} yeni müşteri/iş ortağı`,
    `Aktif gün serisi: ${d.streak} gün`,
    `Aday listesi: toplam ${d.total}; aşamalara göre ${Object.entries(d.stages).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Takip zamanı gelmiş aday: ${d.due}; 5+ gündür sessiz sıcak aday: ${d.quiet}; hiç temas edilmemiş aday: ${d.untouched}`,
    `Bu ay gelir kaydı: ${Math.round(d.income)} TL (hedef ${Math.round(d.targets.monthly_income)} TL)`,
    `Ekip: ${d.teamSize} kişi (${d.teamActive} aktif)`,
    `Akademi: ${d.lessons}/15 ders, ${d.tasks}/14 başlangıç adımı`,
    d.lastReview ? `Son haftalık değerlendirme: ${d.lastReview.score}/10, eylemler: ${(d.lastReview.actions || []).join('; ')}` : 'Henüz haftalık değerlendirme yok',
    `Yaklaşan randevu: ${d.upcoming}`
  ];
  return `Kullanıcının güncel verileri (${new Date().toLocaleDateString('tr-TR')}):\n- ` + lines.join('\n- ');
}

export function coachMessages(context, chat) {
  // İlk kullanıcı mesajına bağlamı ekle; API kullanıcı mesajıyla başlamalı
  const msgs = chat.map(m => ({ role: m.role, content: m.content }));
  if (!msgs.length || msgs[0].role !== 'user') return msgs;
  msgs[0] = { role: 'user', content: `${context}\n\n${msgs[0].content}` };
  return msgs.slice(-20);
}

// ---------- Liste çalışması ----------
export const LIST_FILTERS = {
  untouched: { label: 'Hiç temas edilmemiş', test: p => !p.last_contact_at && ['liste', 'temas'].includes(p.stage) },
  quiet: { label: 'Sessiz kalan sıcaklar', test: (p, now) => p.temperature === 'sicak' && ['liste', 'temas', 'davet', 'sunum', 'takip'].includes(p.stage)
    && (!p.last_contact_at || (now - new Date(p.last_contact_at)) / 864e5 >= 5) },
  all: { label: 'Tüm açık adaylar', test: p => ['liste', 'temas', 'davet', 'sunum', 'takip'].includes(p.stage) }
};

export function pickBatch(prospects, filter, skip = new Set(), size = 10, now = new Date()) {
  const f = LIST_FILTERS[filter] || LIST_FILTERS.all;
  // "!" ile işaretli kişiler çalışma dışı gruptur; liste çalışmasına girmez
  return prospects.filter(p => !p.deleted_at && !skip.has(p.id) && !isExcludedP(p) && f.test(p, now))
    .sort((a, b) => new Date(a.last_contact_at || 0) - new Date(b.last_contact_at || 0))
    .slice(0, size);
}

const isExcludedP = p => /^\s*!/.test(p.full_name || '') || (p.tags || []).includes('!');

export function listPrompt(batch, briefs, userNotes = {}) {
  return `Liste çalışması yapıyoruz. Aşağıdaki ${batch.length} adayı birlikte gözden geçir ve her biri için öneri ver.
${ETHICS}
Öncelik: 1 = bugün ulaş, 2 = bu hafta, 3 = bekleyebilir. Sıcaklık: sicak|ilik|soguk.
"mesaj": o kişiye gönderilecek kısa, kişisel takip mesajı ({isim} yerine adını yaz).
Son teması "hiç" olan (daha önce yazışılmamış) kişiler için mesaj YAZMA, "mesaj" boş olsun; "ilk_adim" alanında ilk temas yolunu öner (ör. yüz yüze, ortak tanıdık, telefon).
Kullanıcı bir kişi hakkında ek bilgi verdiyse onu mutlaka dikkate al.

Adaylar:
${batch.map((p, i) => `${i}. ${briefs[i]}${userNotes[p.id] ? ` | Kullanıcının notu: ${userNotes[p.id]}` : ''}`).join('\n')}

Yalnızca JSON dizi döndür, başka metin yazma:
[{"i":0,"oncelik":1,"sicaklik":"sicak","neden":"tek cümle","ilk_adim":"tek cümle","mesaj":"..."}]`;
}

export function normalizeSuggestions(arr, batchLength) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(x => Number.isInteger(+x.i) && +x.i >= 0 && +x.i < batchLength).map(x => ({
    i: +x.i,
    oncelik: [1, 2, 3].includes(+x.oncelik) ? +x.oncelik : 2,
    sicaklik: ['sicak', 'ilik', 'soguk'].includes(x.sicaklik) ? x.sicaklik : null,
    neden: String(x.neden || ''), ilk_adim: String(x.ilk_adim || ''), mesaj: String(x.mesaj || '')
  }));
}

export const FOLLOW_DAYS = { 1: 0, 2: 2, 3: 7 };
export { firstName };
