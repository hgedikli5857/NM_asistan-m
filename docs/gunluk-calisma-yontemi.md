# Günlük Çalışma Yöntemi: WhatsApp CRM Operasyonu

Bu doküman, WhatsApp işletme hattı üzerinde günlük iletişim işinin nasıl yürütüldüğünü anlatır. Başka bir uygulamaya taşımak için komutlar, akış, veri kaynakları, çıktı formatları, onay kuralları ve dikkat edilmesi gereken noktaları içerir. Kişisel veriler maskelenmiştir.

## Genel ilke

- Asistan **metin üretir ve veri okur**. Veritabanına yazma, etkinlik değişikliği, anahtar kelime oluşturma ve gönderim **kullanıcının açık onayıyla** yapılır.
- Gönderim çoğunlukla **telefondan, kullanıcının kendisi tarafından** yapılır. Panel kuyruğu yalnızca 24 saat penceresi açık kişiler için tercih edilir.
- Hassas bilgi (sağlık, borç, maddi durum, aile) yalnızca cevabı yazmak için kullanılır, saklanmaz.

---

## 1. Komutlar

Sabit bir komut sözdizimi yoktur. Kullanıcı doğal dille talep eder. Aşağıdaki talep türleri kullanılmıştır.

| Talep (örnek ifade) | Asistanın yaptığı | Yazma? |
|---|---|---|
| "Son 24 saati kontrol et" | Bot olayları, insana devir bekleyenler, giden kutusu durumu, yeni gelen mesajlar özetlenir | Hayır |
| "X kişisine takip mesajı hazırla" | Kişi aranır, son mesaj ve pencere durumu gösterilir, metin üretilir | Hayır |
| "Bu kişiye şunu yaz" / "gönder" | Metin giden kutusuna eklenir (panelden gönderim) | Evet, onayla |
| "Şu kişi kim, ne zaman yazdı?" | Kişi kartı ve son mesajlar özetlenir | Hayır |
| "Rehberdeki X grubunu etiketle" | Ön eklere göre etiket önerisi, onayla yazılır | Evet, onayla |
| "Etkinlik ekle" / "etkinlik saatini değiştir" | Etkinlik taslağı gösterilir, onayla yazılır | Evet, onayla |
| "Anahtar kelime oluştur" | Kelime, açılış mesajları (siz ve sen versiyonu) ve bağlantı gösterilir, onayla yazılır | Evet, onayla |
| "Hazır cevap ekle" | Metin gösterilir, onayla eklenir | Evet, onayla |
| "Bunu kaydet" (metin) | Hazır cevap olarak kaydedilmesi önerilir | Evet, onayla |
| "Şu kişiyle hatırlatma kur" | Zamanlanmış hatırlatma oluşturulur | Hayır (kullanıcı verisi değişmez) |
| Ekran görüntüsü (WhatsApp) | Görüntüdeki kişi ve yazışma panelde aranır, eşleşme varsa özet çıkarılır | Hayır |

**Onay kelimeleri:** "onayla", "gönder", "ikisini de onayla". Onay olmadan veri yazılmaz.

---

## 2. Günlük akış

### Sabah açılışı (10:00 civarı)
1. **Son 24 saat taraması:** Yeni gelen mesajlar, insana devir bekleyenler, bot hata olayları, giden kutusu durumu.
2. **Takip günü kontrolü:** Dün kurulan hatırlatmalar ve bekleyen takipler listelenir.
3. **Etkinlik kontrolü:** Yaklaşan etkinlikler için kayıtlı katılımcılar ve saat/adres tutarlılığı kontrol edilir.
4. **Öncelik listesi** oluşturulur (bölüm 4).

### Öncelikli işler (sırayla)
1. Yanıt bekleyen sıcak kişiler (24 saat penceresi açık olanlar önce)
2. Yanlış bilgi verilmiş olan kişiler (saat, adres, fiyat) için düzeltme
3. Kayıt ve teyit işleri (etkinlik kaydı, katılım teyidi)
4. Takip günü gelen kişiler
5. Soğuk ve ilgisi olmayan kişiler (en sonda, nadiren)

### Gün içi
- Yeni gelen mesaj geldikçe kişi özeti ve yanıt önerisi hazırlanır.
- Gönderimler telefondan yapılır. Gönderilen mesaj panele düşmüyorsa kullanıcı bunu bildirir.
- Yeni bilgi (saat değişikliği, vazgeçme, borç ya da sağlık durumu) geldiğinde senaryo tekrar değerlendirilir.

### Gün sonu kapanışı
1. Bugün yapılanların kısa özeti (gönderilen, bekleyen, değişen kayıtlar).
2. Yarın için en az bir net işin belirlenmesi.
3. Gerekirse bir hatırlatma kurulması.

---

## 3. Çıktı formatları

Örnek çıktılar kişisel veriler maskelenerek verilmiştir.

**A. Kişi özeti**
```
KİŞİ: ***** · son4: ****
KORUNAN: hayır · AŞAMA: ilk temas · LİSTE: soğuk
SON GELEN: 21.11 12:21 · PENCERE: AÇIK
ÖZET: Etkinlik hakkında bilgi istedi, konum sordu.
ÖNERİ: Saat ve adres bilgisi ver, kayıt teklif et.
```

**B. Mesaj taslağı**

```
ALICI: ***** · son4: ****
KANAL: telefon (pencere açık) / panel kuyruğu (pencere kapalı)
METİN:
> [mesaj metni]
GÖNDERİM NOTU: ...
DURUM: onay bekliyor
```

**C. Günlük kontrol raporu**
```
SON 24 SAAT
- Yeni gelen mesaj: 14 (5 kişi)
- Bot olayı: 3 cevap, 0 hata, 1 devir
- Giden kutusu: 2 gönderildi, 1 onay bekliyor
- Devir bekleyen: 1 (*****)
- Yaklaşan etkinlik: [ad] · [tarih] · kayıtlı: 2
```

**D. Etkinlik değişikliği önerisi**
```
ETKİNLİK: [ad]
MEVCUT: 22.11 13:45 · YENİ: 22.11 12:30
DEĞİŞECEKLER: başlangıç saati, açılış mesajları
ONAY İSTENİYOR: evet / hayır
```

**E. Etiketleme önerisi**
```
ETİKET: [ad] → [kişi sayısı]
ÖRNEK: ***** , ***** , *****
HARİÇ TUTULANLAR: "!" ile başlayanlar (sayı)
ONAY İSTENİYOR: evet / hayır
```

---

## 4. Kişi önceliklendirme

Sıralama şu sorulara göre yapılır:

1. **Pencere açık mı?** Son gelen mesaj 24 saat içindeyse öncelik artar.
2. **Yanıt bekleniyor mu?** Kişi bir soru sorduysa ya da bilgi istediyse öncelik en yüksek.
3. **Yanlış bilgi var mı?** Yanlış saat, adres ya da fiyat verilmişse önce düzeltilir.
4. **Kayıt ya da teyit gerekiyor mu?** Etkinlik katılımı ve kayıt işleri öncelikli.
5. **Takip günü geldi mi?** Önceden kurulan takip işlemleri.
6. **Hassas durum var mı?** Maddi zorluk ya da sağlık paylaşımı varsa acele edilmez, dinleme öncelikli yaklaşılır.
7. **Soğuk mu?** Yanıt vermemiş ya da ilgisiz kişiler en sonda.

**Dışarıda tutulanlar:** "!" ile başlayan rehber kayıtları (çalışma grubu dışı).

---

## 5. Veri kaynakları

| Veri | Ne için kullanılır |
|---|---|
| Kişi kaydı (ad, son4, korunan mı, aşama, liste türü, şehir, meslek, notlar) | Kişi tanıma ve bağlam |
| Konuşmalar ve mesajlar (gelen/giden, kaynak, zaman) | Son durum, pencere kontrolü, yazışma geçmişi |
| Etiketler | Gruplama, toplu iletişim kapsamı |
| Etkinlikler ve katılımcılar | Kayıt durumu, saat ve adres tutarlılığı |
| Anahtar kelimeler ve kullanım sayısı | Video ve paylaşım takibi |
| Giden kutusu | Gönderim kuyruğu ve durum |
| Bot olayları | Hata ve devir takibi |
| Bot ayarları ve fiyat listesi | Ürün ve fiyat bilgisi (kataloğa göre cevap) |
| Hazır cevaplar | Tekrar kullanılan metinler |

**Bilinen sınır:** Instagram üzerinden gelen bazı konuşmalar (kullanıcı adıyla görünen) panele düşmüyor. Bu kişilerin durumu panelden görülemiyor.

---

## 6. Mesaj hazırlama adımları ve onay akışı

1. **Bağlam:** Kişi kaydı ve son mesajlar okunur. Yazışma geçmişi özetlenir.
2. **Durum:** Pencere açık mı kapalı mı belirlenir. Kapalıysa telefondan gönderim önerilir.
3. **Senaryo:** Kişi durumu (takip, ilgili, ertelemek isteyen, kararsız, vazgeçmiş, maddi zorluk) sınıflandırılır.
4. **Metin:** Marka filtresinden geçirilerek taslak yazılır (bölüm 7).
5. **Hitap:** Yeni kişi için "siz", rehberdeki kişi için ilişkiye göre "sen" ya da "siz".
6. **Gösterim:** Alıcı, son mesaj, pencere durumu, metin ve gönderim notu sunulur.
7. **Onay:** Kullanıcı düzenleyebilir ve onaylar.
8. **Gönderim:** Telefondan kullanıcı gönderir ya da onay sonrası panel kuyruğuna eklenir.
9. **Takip:** Gönderim sonucu kullanıcı tarafından bildirilir.

---

## 7. Marka ve içerik kuralları

- Terim: "bireysel girişimcilik". "Network marketing", "MLM", "çok katmanlı", "ponzi" kullanılmaz.
- Gelir: kazanç, gelir rakamı, kazanç planı, prim, hacim gibi ifadeler kullanılmaz.
- Sağlık: tedavi, iyileşme, hastalık adı, kesin etki iddiası yok. Ürün "patch" olarak anılır.
- Ton: abartı yok, garanti yok, aciliyet baskısı yok.
- Kapanış: kişiye kolay çıkış bırakılır.
- Hitap: yeni kişiye "siz", rehberde kişiye göre.
- Vazgeçen kişiye ek soru gönderilmez.

---

## 8. Bu yöntemin iyi çalıştığı üç nokta

1. **Onay zorunluluğu:** Hiçbir veri yanlışlıkla değişmedi. Her yazma işlemi kullanıcı onayından geçti.
2. **Senaryo çerçevesi:** Her kişiye durumuna uygun yaklaşım seçildi. Vazgeçen ya da maddi zorluk yaşayan kişilere baskı yapılmadı.
3. **Veriye dayalı kontrol:** Günlük tarama sayesinde kaçan mesajlar, yanlış bilgi ve gönderilmeyen kuyruk öğeleri fark edilebildi.

---

## 9. Bilinen hatalar ve dikkat edilecekler

- **Marka kuralı ihlali:** Bir mesajda "network marketing" ifadesi kullanıldı. Bu tür ifadeler için filtre zorunlu.
- **Yanlış bilgi:** Bir kişiye yanlış saat ve adres verildi. Her etkinlik bilgisi kayıtla karşılaştırılmalı.
- **Çift cevap ve yanlış alan doldurma:** Anahtar kelimeyle açılan konuşmada bot hem açılış mesajı gönderdi hem de aynı mesajı normal akışta işledi. Şehir alanı yanlış dolabildi. Kod düzeltmesi gerekiyor.
- **Panele düşmeyen konuşmalar:** Kullanıcı adıyla gelen (Instagram) bazı konuşmalar kayda geçmedi.
- **Hassas veri:** Bazı kişi kartlarında sağlık bilgisi notlara yazılmış olabilir. Yeni kayıtlarda bu tür bilgilerin saklanmaması gerekir.
- **Pencere kapalı kişiler:** Panel gönderimi takılabilir. Bu kişilere mesaj telefondan gönderilmeli.
- **Tek kişi odaklılık:** Tüm karar ve onaylar tek kullanıcıda. Ekip kullanımı için yetki ve veri erişim kuralı tanımlanmalı.

---

## 10. Yeni uygulamaya taşıma için kontrol listesi

- [ ] Komut ve talep türleri (bölüm 1) yeni arayüzde karşılanıyor mu?
- [ ] Sabah ve akşam akışı (bölüm 2) otomatik özet olarak sunuluyor mu?
- [ ] Çıktı formatları (bölüm 3) kişisel veriyi maskeliyor mu?
- [ ] Öncelik sırası (bölüm 4) uygulanıyor mu?
- [ ] Hassas veri saklanmıyor mu?
- [ ] Onay olmadan yazma yapılmıyor mu?
- [ ] Marka filtresi (bölüm 7) çıktıda çalışıyor mu?
- [ ] Pencere durumu her mesajda gösteriliyor mu?