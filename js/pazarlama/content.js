// Pazarlama: içerik sütunları ve caption fikir bankası (uyumlu dil: sağlık iddiası yok, kazanç vaadi yok)
export const PILLARS = [
  { id: 'yasam', label: 'Yaşam ve gelişim', share: 30, hint: 'Gününden bir an, okuduğun kitap, küçük bir alışkanlık.' },
  { id: 'ogretici', label: 'Öğretici', share: 25, hint: 'Bir ipucu, mini rehber, "bunu nasıl yapıyorum".' },
  { id: 'deneyim', label: 'Ürün deneyimi', share: 20, hint: 'Kendi kullanım rutinin. Hastalık adı ve iyileşme iddiası yok.' },
  { id: 'etkilesim', label: 'Etkileşim', share: 15, hint: 'Soru, anket, "sen hangisini seçerdin?"' },
  { id: 'ekip', label: 'Ekip ve iş', share: 10, hint: 'Eğitim, etkinlik, ekipten bir hikâye. Rakam vaadi yok.' }
];
export const pillarLabel = id => PILLARS.find(p => p.id === id)?.label || '—';

export const FORMATS = { gonderi: 'Gönderi', reels: 'Reels', karusel: 'Karusel', story: 'Story', canli: 'Canlı yayın', video: 'Video' };
export const PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'WhatsApp durum'];
export const POST_STATUS = { fikir: 'Fikir', taslak: 'Taslak', hazir: 'Hazır', paylasildi: 'Paylaşıldı' };

export const IDEAS = [
  { pillar: 'yasam', topic: 'Sabah rutinim', caption: 'Güne başlarken yaptığım 3 küçük şey: su, 10 dakika yürüyüş ve günün tek önceliğini yazmak. Küçük ama istikrarlı adımlar. Senin sabah rutininde ne var? ☀️' },
  { pillar: 'yasam', topic: 'Bu ay okuduğum kitap', caption: 'Bu ay elimde bu kitap vardı. Aklımda kalan cümle: "Alışkanlıklar, kim olduğunun oylarıdır." Sen bu ara ne okuyorsun? 📚' },
  { pillar: 'yasam', topic: 'Haftanın dersi', caption: 'Bu hafta öğrendiğim şey: her şeyi bir anda değiştirmeye çalışmak yerine tek bir şeyi her gün yapmak. Sen bu hafta neyi öğrendin?' },
  { pillar: 'ogretici', topic: 'Zaman planlama ipucu', caption: 'Yoğun haftalarda işe yarayan yöntemim: pazar akşamı 15 dakika ayırıp haftanın 3 önemli işini takvime koymak. Denemek isteyen? 🗓️' },
  { pillar: 'ogretici', topic: 'Evde düzenli temizlik rutini', caption: 'Evi her gün 10 dakikada toparlamanın sırrı: tek oda, tek zamanlayıcı, tek liste. Kendi rutinimi story\'de anlattım.' },
  { pillar: 'ogretici', topic: 'Cilt bakım rutinimi nasıl kurdum', caption: 'Basit tuttuğum bakım rutinim: temizle, nemlendir, güneşten koru. Ürünlerin ilaç olmadığını unutma; cildinle ilgili bir sorun varsa dermatoloğa danış.' },
  { pillar: 'deneyim', topic: 'Kullandığım ürün', caption: 'Bir süredir kullandığım ürünlerden biri. Kendi deneyimim: kullanımı pratik ve rutinime kolayca girdi. Merak eden olursa yazabilir, deneyimimi anlatırım.' },
  { pillar: 'deneyim', topic: 'Temizlik ürünleri denemesi', caption: 'Mutfakta bu hafta yeni temizlik ürünlerini denedim. En çok hoşuma giden: az miktarla yetmesi. Sen evde en çok hangi ürünü kullanıyorsun?' },
  { pillar: 'deneyim', topic: 'Kişisel bakım favorilerim', caption: 'Çantamdan hiç eksik etmediğim 3 kişisel bakım ürünü. Liste bende, merak eden DM atsın 💬' },
  { pillar: 'etkilesim', topic: 'Anket: sabah mı akşam mı?', caption: 'Spor için sen hangisisin: sabahçı mı akşamcı mı? Yorumlara yaz, en çok seçileni bir sonraki videoda konuşalım 👇' },
  { pillar: 'etkilesim', topic: 'Bir kelimeyle bu hafta', caption: 'Bu haftayı tek kelimeyle anlat. Benimki: "odak". Seninki?' },
  { pillar: 'etkilesim', topic: 'Soru-cevap', caption: 'Bu hafta sorularınızı yanıtlıyorum: yaptığım iş, kullandığım ürünler, günlük düzenim. Story\'deki kutuya yazabilirsin.' },
  { pillar: 'ekip', topic: 'Ekip eğitiminden bir kare', caption: 'Bu akşam ekiple birlikte iletişim üzerine çalıştık. En sevdiğim kısım: birbirimizden öğrenmek. Birlikte büyü 🤝' },
  { pillar: 'ekip', topic: 'Neden bu işi yapıyorum', caption: 'Bu işe neden başladığımı çok soruyorlar. Kısaca: kendi zamanımı yönetmek ve insanlarla birlikte gelişmek. Kolay mı? Hayır. Emek istiyor. Ama öğrettikleri çok değerli.' },
  { pillar: 'ekip', topic: 'Online tanıtım duyurusu', caption: 'Perşembe akşamı kısa bir online tanıtım yapıyoruz: ürünler ve nasıl çalıştığımız. Baskı yok, sadece bilgi. Katılmak isteyen DM atsın.' }
];
