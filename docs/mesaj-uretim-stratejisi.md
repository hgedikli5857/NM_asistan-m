# Mesaj Üretim Stratejisi: Web Uygulaması Spesifikasyonu

Bu doküman, WhatsApp CRM sohbetinde kullanılan mesaj üretim yöntemini bir web uygulamasına taşımak için kuralları, senaryoları ve kabul kriterlerini içerir. Amaç metin üretmek. Gönderim her zaman insan onayıyla yapılır.

## 1. Temel ilkeler

- Uygulama metin üretir, gönderimi kullanıcı yapar. Otomatik gönderim yoktur.
- Kişisel ve hassas bilgiler (sağlık, borç, maddi zorluk, aile sorunları) veritabanında saklanmaz. Yalnızca o anki metni yazmak için kullanılır.
- Çalışma dışı gruplar (ön eki "!" olan kişiler) uygulamanın kapsamı dışındadır.
- Dil: sade, samimi, Türkçe. Gereksiz teknik terim yok.

## 2. Marka filtresi (çıkış kontrolü)

Üretilen her metin, gönderilmeden önce şu kurallardan geçer:

| Kural | Yasak / Zorunlu |
|---|---|
| Terim | "network marketing", "MLM", "çok katmanlı", "ponzi" yasak. Her zaman "bireysel girişimcilik" |
| Gelir | Kazanç, gelir rakamı, "kazanç planı", "hacim", "prim" gibi ifadeler yasak |
| Sağlık | Tedavi, iyileşme, hastalık adı, kesin etki iddiası yasak. Ürün "patch" olarak anılır, "bant" değil |
| Ton | Abartı yok, "garanti" yok, baskı veren aciliyet ifadeleri yok ("fırsat kaçıyor" gibi) |
| Kapanış | Mesaj sonunda kişiye kolay bir çıkış bırakılır |

Filtreye takılan metin üretilmez, yerine uyumlu bir alternatif önerilir.

## 3. Hitap kuralı

- Yeni kişi: **siz**
- Rehberdeki kişi: ilişkiye göre **sen** veya **siz**. Emin değilse **siz**.
- Asistan kimliği: Bot ve otomatik mesajlarda "Hakan Bey'in dijital asistanı". Kişisel gönderimde (telefondan) birinci tekil şahısla Hakan gibi.

## 4. Senaryo çerçevesi

Her kişi için önce durum belirlenir, ardından senaryoya göre metin üretilir.

| Durum | Yaklaşım | Çıktı |
|---|---|---|
| Takip (cevap yok) | Yeni ve somut bir sebep (etkinlik, bilgi) ile kısa mesaj. Suçlama yok | 1 mesaj |
| İlgili, almak istiyor | Küçük ve uygun bir seçenekle başlat, ödemeyi kullanıcının düzenine bırak | Seçim sorusu |
| Ertelemek istiyor | Anlayış göster, tarih sor, tarih vermezse kapat | Kısa mesaj |
| Kararsız | Tek yumuşak takip, ısrar yok | 1 mesaj, sonra bekleme |
| Vazgeçti / ilgisiz | Teşekkür, kapıyı açık bırak, takibi durdur | Kapanış mesajı |
| Maddi zorluk belirtti | Satış yapma, durumu dinle, ürün önerisini ertele | Dinleme odaklı mesaj |

Vazgeçen ya da ilgisiz olduğunu açıkça söyleyen kişiye ek soru gönderilmez.

## 5. Zamanlama ve WhatsApp kuralları

- **24 saat penceresi:** Son gelen mesajdan sonra 24 saat içindeyse serbest metin gönderilebilir. Pencere kapalıysa yalnızca onaylı şablon gönderilebilir. Uygulama her metin için pencere durumunu gösterir.
- **Sınırlar:** Aynı kişiye 10 dakikada en fazla 1 mesaj. Günlük toplam kuyruk limiti: 30.
- **Soğuk mesaj:** Daha önce yazışılmamış kişilere metin önerilmez. Önce ilk temas yolu netleştirilir.

## 6. Onay akışı

1. Kullanıcı kişiyi ve amacı seçer.
2. Uygulama alıcı bilgisini (ad, son 4 hane, korunan mı), son mesajlaşmayı, pencere durumunu ve metni gösterir.
3. Kullanıcı düzenleyebilir ve onaylar.
4. Onaydan sonra metin kopyalanır ya da kuyruğa eklenir. Otomatik gönderim yapılmaz.
5. Gönderildikten sonra kullanıcı durumu işaretler (gönderildi / cevap geldi / vazgeçti).

## 7. Veri kuralları

- Saklanan alanlar: ad, son 4 hane, aşama, liste türü, etiketler, etkinlik kaydı.
- Saklanmayan alanlar: sağlık bilgisi, borç ve maddi durum, aile içi konular, politik ve dini görüşler.
- Üretilen metinler yalnızca kullanıcının geçmişinde tutulur, kişi kartına yazılmaz.

## 8. Kabul kriterleri

- [ ] Her çıktı marka filtresinden geçer, yasak ifade kalmaz.
- [ ] Yeni kişiye "siz" hitabı kullanılır.
- [ ] Pencere kapalıyken serbest metin önerilmez, kullanıcıya bildirilir.
- [ ] Gönderim onaysız yapılamaz.
- [ ] Çalışma dışı gruplar listelenmez ve metin üretilmez.
- [ ] Hassas bilgi veritabanına yazılmaz.
- [ ] Vazgeçen kişiye ek soru üretilmez.

## 9. Kapsam dışı (ilk sürüm)

- Toplu (kitlesel) gönderim
- Otomatik takip zamanlaması
- Ekip üyeleri için ortak erişim
- Ürün dışı marka kampanyaları

## 10. Açık sorular

- Veri kaynağı: crm-panel veritabanı mı, ayrı bir veritabanı mı?
- Kullanıcı sayısı: yalnızca Hakan mı, yoksa ekip üyeleri de mi?
- Uygulama adı: marka kuralı gereği iç kullanım dışında "Network Marketing" yerine farklı bir ad önerilir.