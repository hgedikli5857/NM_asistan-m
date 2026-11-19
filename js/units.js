// Departmanın 6 birimi. Menü, panel kartları ve birim sayfaları bu listeden üretilir.
// group: 'grow' = aday ve büyüme, 'team' = ekip ve sistem
export const UNITS = [
  {
    id: 'kazanim', title: 'Kazanım', icon: 'ti-target-arrow', group: 'grow', phase: 1, live: true,
    summary: 'Aday listesi, satış hunisi ve günlük aksiyon.',
    features: [
      'Sıcak liste ve aday kartları (sıcak / ılık / soğuk)',
      'Satış hunisi: Liste → Temas → Davet → Sunum → Takip → Karar',
      'Bugün kimi aramalıyım? Günlük aksiyon listesi (Power Hour)',
      'Takip hatırlatmaları ve "5 gündür ses yok" uyarıları',
      'Eski nm-asistan verilerini içe aktarma'
    ]
  },
  {
    id: 'iletisim', title: 'İletişim', icon: 'ti-message-chatbot', group: 'grow', phase: 1, live: true,
    summary: 'Mesaj şablonları, itiraz rehberi ve AI koç.',
    features: [
      'Kanal ve amaca göre WhatsApp / DM şablonları',
      'İtiraz rehberi: "Vaktim yok", "Param yok", "Piramit mi?"',
      'AI ile kişiye özel mesaj üretimi',
      'Yasaklı ifade uyarısı (sağlık iddiası, kazanç vaadi)',
      'AI rol yapma pratiği (6 senaryo, sponsor geri bildirimi)'
    ]
  },
  {
    id: 'pazarlama', title: 'Pazarlama', icon: 'ti-speakerphone', group: 'grow', phase: 3, live: true,
    summary: 'İçerik takvimi, Instagram ve aday toplama sayfası.',
    features: [
      'Haftalık içerik takvimi ve hazır caption',
      'Instagram DM / yorumdan adaya dönüştürme',
      'hakangedikli.com aday formu → doğrudan Kazanım birimine',
      'Kampanya ve etkinlik duyuruları'
    ]
  },
  {
    id: 'ekip', title: 'Ekip', icon: 'ti-users-group', group: 'team', phase: 2, live: true,
    summary: 'Soy ağacı, aktiflik takibi, randevu ve etkinlik.',
    features: [
      'Ekip üyesi daveti ve rol yönetimi (sahip / lider / üye)',
      'Sponsor ilişkisine göre soy ağacı görünümü',
      'Aktif / pasif durumu ve son aktivite',
      'Sunum ve randevu takvimi, katılım durumu'
    ]
  },
  {
    id: 'akademi', title: 'Akademi', icon: 'ti-school', group: 'team', phase: 2, live: true,
    summary: '90 günlük başlangıç programı, dersler ve rozetler.',
    features: [
      '"İlk 14 gün" kontrol listesi',
      '90 günlük onboarding programı',
      'Dersler, quiz ve ilerleme yüzdesi (nm-asistan eğitimleri taşınacak)',
      'Rozetler ve seri (streak) takibi'
    ]
  },
  {
    id: 'olcum', title: 'Ölçüm ve uyum', short: 'Ölçüm', icon: 'ti-chart-histogram', group: 'team', phase: 1, live: true,
    summary: 'KPI paneli, haftalık hesap verme, KVKK ve İYS.',
    features: [
      'Günlük öncü göstergeler: temas, davet, takip, sunum',
      'Haftalık hesap verme formu ve 10 üzerinden puan',
      'Aylık gelir hedefi ilerlemesi (50.000 TL)',
      'KVKK aydınlatma / açık rıza ve İYS onay kayıtları'
    ]
  }
];

export const findUnit = id => UNITS.find(u => u.id === id);
