# NM Departmanı

One More International ekibi için network marketing operasyon merkezi. Telefona kurulabilen bir web uygulaması (PWA).

- **Canlı adres:** https://hgedikli5857.github.io/NM_asistan-m/
- **Eski uygulama (NM Asistanı):** https://hgedikli5857.github.io/NM_asistan-m/eski/

## Birimler

| Birim | İçerik | Faz |
|---|---|---|
| Kazanım | Aday listesi, satış hunisi, günlük aksiyon | 1 |
| İletişim | Mesaj şablonları, itiraz rehberi, AI koç | 1 |
| Ölçüm ve uyum | KPI paneli, hesap verme, KVKK / İYS | 1 |
| Ekip | Soy ağacı, aktiflik, randevu | 2 |
| Akademi | 90 günlük onboarding, dersler, rozetler | 2 |
| Pazarlama | İçerik takvimi, Instagram, aday formu | 3 |

## Teknik yapı

- Derleme adımı yok: düz HTML, CSS ve JavaScript modülleri. GitHub Pages doğrudan yayınlar.
- Veritabanı ve giriş: Supabase (`nm-departmani` projesi, Frankfurt).
- Çok ekipli yapı: her kullanıcı kayıt olunca kendi ekibi (organizasyon) otomatik oluşur.
- Güvenlik: tüm tablolarda RLS açık. Aday verisi yalnızca onu ekleyen kişiye görünür.

```
index.html            uygulama kabuğu
manifest.webmanifest  PWA ayarları
sw.js                 çevrimdışı önbellek
css/                  tasarım sistemi (lacivert & altın)
js/app.js             oturum, menü, yönlendirme
js/units.js           6 birimin tanımı
js/views/             sayfalar
supabase/migrations/  veritabanı şeması
eski/                 eski NM Asistanı
```

## Yerelde çalıştırma

```bash
python3 -m http.server 8080
# http://localhost:8080 adresini aç
```
