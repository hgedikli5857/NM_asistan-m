# NM Departmanı

One More International ekibi için network marketing operasyon merkezi. Telefona kurulabilen bir web uygulaması (PWA).

- **Canlı adres:** https://hgedikli5857.github.io/NM_asistan-m/
- **Eski uygulama (NM Asistanı):** https://hgedikli5857.github.io/NM_asistan-m/eski/

## Birimler

| Birim | İçerik |
|---|---|
| Kazanım | Bugün listesi, aday listesi, satış hunisi, aday kartı, eski uygulamadan içe aktarma |
| İletişim | Mesaj yaz, 21 uyumlu şablon, 12 itiraz yanıtı, canlı uyum kontrolü, AI rol yapma pratiği |
| Pazarlama | İçerik takvimi ve denge, caption fikirleri, web sitesi aday formu (`form.html`), Instagram'dan aday |
| Ekip | Davet linki, üyeler ve aktiflik, soy ağacı, takvim ve ekip etkinlikleri, sıralama, rol yönetimi |
| Akademi | İlk 14 gün listesi, 90 günlük program (15 ders + quiz), 15 rozet |
| Ölçüm ve uyum | Göstergeler ve hedefler, haftalık hesap verme, gelir takibi, KVKK kapsamı ve kalıcı silme |

Ayarlar: profil, şifre, AI anahtarı (yalnızca tarayıcıda), ekip adı, verileri dışa aktarma (JSON/CSV).

## Gizlilik ilkeleri

- Aday verisi yalnızca kaydı oluşturan kişiye görünür (RLS). Liderler ekip özetinde yalnızca toplu sayıları görür.
- Sağlık, gelir gibi hassas aday bilgileri eski uygulamadan taşınmaz.
- Herkese açık uç noktalar: `lead_form_info`, `submit_lead` (KVKK onayı, bot tuzağı, saatlik limit).

## Testler

```bash
for f in tests/*.test.mjs; do node "$f"; done
```

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


## WhatsApp bot CRM köprüsü (v3.1)
- crm-panel (WhatsApp bot) verisi `crm` Edge Function üzerinden **salt-okunur** çekilir; erişim token'ı yalnızca `private.crm_links` içinde, tarayıcıya gitmez.
- crm-panel tarafı: `supabase/crm-panel/20261120090000_nmd_kopru.sql` (`nmd_export`, `nmd_messages`; hash'lenmiş token).
- Bot'a yazan yeni kişiler "WhatsApp bot" etiketli aday olur; telefonu listede olanlar mevcut adayla eşleşir (son 10 hane).
- Korunan (kişisel rehber) kişiler yeni aday yapılmaz. `saglik_notlari`, `gelir_tahmini`, medeni durum, çocuk sayısı, yaş **hiç aktarılmaz**.
- Aşama yalnızca ileri taşınır. Senkron: Ayarlar → "Şimdi senkronla" ya da Kazanım açılışında 30 dakikada bir otomatik.
- Aday kartında bot konuşma özeti ve mesaj geçmişi; Bugün sekmesinde "WhatsApp'ta seni bekleyenler".
