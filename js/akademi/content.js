// Akademi içeriği: İlk 14 gün listesi, 90 günlük program (15 ders) ve rozetler.
// İlke: gerçekçi ol, kolay para vaat etme, sağlık iddiası yapma, kimseye baskı kurma.

export const FIRST_14 = [
  { id: 'g01', day: 1, title: 'Neden başladığını yaz', tip: 'Gerçek motivasyonunu 3 cümleyle yaz. Zor günlerde bu notu okuyacaksın.' },
  { id: 'g02', day: 1, title: 'Sponsorunla tanışma görüşmesi yap', tip: 'Hedeflerini, haftada ayırabileceğin saati ve sorularını konuş.' },
  { id: 'g03', day: 2, title: 'Ürünleri kendin kullanmaya başla', tip: 'Anlatacağın şey kendi deneyimin olacak. Deneyim, ezberden güçlüdür.' },
  { id: 'g04', day: 2, title: 'Sıcak listene ilk 20 kişiyi ekle', tip: 'Kazanım → Aday ekle. Yargılamadan yaz; kimin ilgileneceğine sen karar vermiyorsun.' },
  { id: 'g05', day: 3, title: '"NM ile geleneksel iş" dersini bitir', tip: 'Akademi → Program → Ders 1.' },
  { id: 'g06', day: 3, title: 'Haftalık zaman planını çıkar', tip: 'Takvimine haftada en az 5 sabit "iş saati" koy.' },
  { id: 'g07', day: 4, title: 'Sıcak listeni 50 kişiye çıkar', tip: 'Telefon rehberine, okul/iş arkadaşlarına, komşulara göz at.' },
  { id: 'g08', day: 5, title: 'İlk 5 kişiyle sohbet başlat', tip: 'Amaç satış değil, ilişki. İletişim → İlk temas şablonlarından yararlan.' },
  { id: 'g09', day: 6, title: 'Bir sunuma misafir olarak katıl', tip: 'Sponsorunun ya da ekibin sunumunu izle, not al.' },
  { id: 'g10', day: 7, title: 'İlk haftalık hesap vermeni yap', tip: 'Ölçüm → Hesap verme. Dürüst puan ver.' },
  { id: 'g11', day: 9, title: 'İlk davetini gönder', tip: 'Merak uyandır, her şeyi mesajda anlatma. Hedef: kısa bir görüşme.' },
  { id: 'g12', day: 10, title: 'İtiraz rehberinden 3 yanıtı çalış', tip: 'İletişim → İtiraz rehberi. Kendi cümlelerinle sesli tekrar et.' },
  { id: 'g13', day: 12, title: 'İlk sunumunu (sponsorunla birlikte) yap', tip: 'Üçlü görüşme: sen, aday ve sponsorun. Sen dinle, o anlatsın.' },
  { id: 'g14', day: 14, title: 'İlk 14 günü sponsorunla değerlendir', tip: 'Ne iyi gitti, ne zorladı, önümüzdeki 30 günün hedefi ne?' }
];

export const MODULES = [
  { id: 'temel', title: 'Temel seviye', days: [1, 30], summary: 'Doğru zihniyet, sıcak liste, ilk temas ve davet.' },
  { id: 'orta', title: 'Orta seviye', days: [31, 60], summary: 'Sunum, itiraz, takip ve sosyal medya.' },
  { id: 'ileri', title: 'İleri seviye', days: [61, 90], summary: 'Liderlik, duplikasyon, ekip ve sistem.' }
];

// q: soru, o: seçenekler, a: doğru seçeneğin sırası
export const LESSONS = [
  // ===================== TEMEL =====================
  { id: 'd01', module: 'temel', minutes: 6, title: 'NM ile geleneksel işin gerçek farkı',
    body: [
      'Geleneksel işte zamanını bir maaşla takas edersin; gelirin büyük ölçüde çalıştığın saatle sınırlıdır. Network marketingde ise ürün satışı ve kurduğun ekibin satışları üzerinden gelir oluşur.',
      'Bu fark bir avantaj ama bir yanılsama da yaratabilir. NM "çalışmadan kazanma" modeli değildir. Kendi işini yönetirsin: patronun yoktur, ama seni zorlayan biri de yoktur. Disiplin tamamen sende.',
      'Gerçekçi tablo şu: çoğu kişi ilk aylarda düşük gelir elde eder. Sonuç; tutarlı aktivite, öğrenme ve sabırla gelir. Bu yüzden ilk hedefin para değil, alışkanlık olmalı.'
    ],
    points: ['NM bir iş modelidir, sihir değildir.', 'Gelir; ürün satışı ve ekip satışından oluşur.', 'İlk hedef: haftalık tutarlı aktivite alışkanlığı.'],
    exercise: 'Haftada bu işe gerçekte kaç saat ayırabileceğini yaz ve takvimine işle.',
    quiz: [
      { q: 'Network marketingde gelir neye dayanır?', o: ['Üye kaydı ücretlerine', 'Ürün satışı ve ekip satışlarına', 'Yatırılan paranın faizine'], a: 1 },
      { q: 'Yeni başlayan biri için en doğru ilk hedef hangisi?', o: ['İlk ayda yüksek gelir', 'Tutarlı haftalık aktivite alışkanlığı', 'Hemen işini bırakmak'], a: 1 }
    ] },
  { id: 'd02', module: 'temel', minutes: 5, title: 'Doğru niyet ve zihinsel temel',
    body: [
      'İnsanlar ne söylediğinden çok niyetini hisseder. Karşındakine "satılacak biri" gözüyle bakarsan bunu anlar. Niyetin "bu kişiye bir değer sunabilir miyim?" olduğunda konuşman doğallaşır.',
      'Ret bu işin parçasıdır. "Hayır" kişisel bir saldırı değil, o anki bir durumdur. Profesyoneller reddi sayı olarak görür: her "hayır", bir sonraki "evet"e yaklaştırır.',
      'Kendini sonuçla değil aktiviteyle ölç. "Bugün kaç kişi kaydoldu?" değil, "Bugün kaç kişiyle gerçek bir sohbet yaptım?" diye sor.'
    ],
    points: ['Niyet: değer sunmak, ikna etmek değil.', 'Ret kişisel değildir.', 'Aktiviteyi ölç, sonucu değil.'],
    exercise: 'Son reddedilişini düşün. O kişiyle ilişkini nasıl koruyabilirsin? Bir cümle yaz.',
    quiz: [
      { q: 'Bir aday "hayır" dediğinde en sağlıklı yorum hangisi?', o: ['Beni sevmiyor', 'Şu an onun için doğru zaman değil', 'Daha çok ısrar etmeliyim'], a: 1 },
      { q: 'Günlük başarıyı ölçmenin en iyi yolu nedir?', o: ['Yapılan gerçek sohbet sayısı', 'Sadece kayıt sayısı', 'Sosyal medya beğenileri'], a: 0 }
    ] },
  { id: 'd03', module: 'temel', minutes: 7, title: 'Sıcak liste: kimler dahil, kimler değil',
    body: [
      'Sıcak liste, tanıdığın herkesin yazılı listesidir. Altın kural: yazarken yargılama. "Bu ilgilenmez" kararını sen verme; o kişinin hakkıdır.',
      'Hafıza tetikleyicileri kullan: aile, akraba, okul, eski iş yerleri, komşular, spor salonu, esnaf, sosyal medya takipçileri. İlk hedefin 100 isim.',
      'Listeye dahil etme: seni açıkça istemediğini söylemiş kişiler ve ilişkiyi zedeleyeceğini bildiğin durumlar. Listedeki herkesle aynı gün konuşmak zorunda değilsin; önce en sıcak 20 kişiyle başla.'
    ],
    points: ['Yazarken yargılama.', 'Hedef: 100 isim, başlangıç: en sıcak 20.', 'İstemediğini söyleyenlere saygı göster.'],
    exercise: 'Kazanım biriminde 15 dakikada en az 20 isim ekle ve her birine sıcak/ılık/soğuk etiketi ver.',
    quiz: [
      { q: 'Sıcak liste hazırlarken en sık yapılan hata nedir?', o: ['Çok fazla isim yazmak', 'Kimin ilgileneceğine önceden karar vermek', 'Telefon numarası yazmak'], a: 1 },
      { q: 'Önce kimlerle başlamalısın?', o: ['Hiç tanımadığın kişilerle', 'Listendeki en sıcak 20 kişiyle', 'Herkesle aynı gün'], a: 1 }
    ] },
  { id: 'd04', module: 'temel', minutes: 6, title: 'İlk temas: ne denir, ne denmez',
    body: [
      'İlk temasın amacı ilişki kurmak ya da yenilemektir, ürün veya iş anlatmak değil. Uzun süredir görüşmediğin birine ilk mesajda iş anlatırsan, kendini kullanılmış hisseder.',
      'İyi bir ilk temas kişiseldir, kısadır ve bir soruyla biter: "Nasılsın, bu aralar neler yapıyorsun?" Sonra dinle. İnsanlar ihtiyaçlarını ve hayallerini sohbet içinde kendileri söyler.',
      'Denmeyecekler: "Harika bir fırsat var!", kazanç rakamları, "Bu ürün şu hastalığa iyi geliyor" gibi sağlık iddiaları ve uzun bilgi mesajları.'
    ],
    points: ['Önce ilişki, sonra iş.', 'Kısa, kişisel, soruyla biten mesaj.', 'Rakam ve sağlık iddiası yok.'],
    exercise: 'İletişim → İlk temas şablonlarından birini kendi cümlelerinle yeniden yaz ve 3 kişiye gönder.',
    quiz: [
      { q: 'İlk temas mesajının amacı nedir?', o: ['İş fırsatını anlatmak', 'İlişki kurmak veya yenilemek', 'Ürün fiyatını vermek'], a: 1 },
      { q: 'Hangisi ilk temasta söylenmemelidir?', o: ['"Nasılsın, neler yapıyorsun?"', '"Bu ürün şeker hastalığına iyi geliyor"', '"Seni görmeyi özledim"'], a: 1 }
    ] },
  { id: 'd05', module: 'temel', minutes: 7, title: 'Davet etiği ve sistemi',
    body: [
      'Davetin tek amacı adayı bir sunuma ya da görüşmeye getirmektir. Mesajda her şeyi anlatma; bilgi yüklemesi merakı öldürür ve görüşme ihtiyacını ortadan kaldırır.',
      'Etik davet açıktır: konunun bir iş veya ürün olduğunu gizleme. "Kahve içelim" deyip masada sunum açmak güveni yok eder. Doğrusu: "Üzerinde çalıştığım bir iş var, fikrini merak ediyorum. 20 dakikanı ayırır mısın?"',
      'Sistem: davet → onay → hatırlatma (bir gün önce) → görüşme → 24-48 saat içinde takip. Randevuyu iki seçenekle iste: "Salı mı perşembe mi uygun?"'
    ],
    points: ['Davetin amacı görüşmedir, ikna değil.', 'Konuyu gizleme; şeffaf ol.', 'Davet → hatırlatma → görüşme → takip.'],
    exercise: 'Bu hafta 3 kişiye iki seçenekli bir randevu daveti gönder ve Ekip → Takvim\'e işle.',
    quiz: [
      { q: 'Etik bir davette hangisi yanlıştır?', o: ['Konunun iş olduğunu söylemek', 'Kahve bahanesiyle çağırıp sunum yapmak', 'İki seçenekli zaman sormak'], a: 1 },
      { q: 'Davet mesajında neden her şey anlatılmaz?', o: ['Merakı öldürür, görüşme ihtiyacını ortadan kaldırır', 'Mesajlar ücretli olduğu için', 'Yasak olduğu için'], a: 0 }
    ] },
  // ===================== ORTA =====================
  { id: 'd06', module: 'orta', minutes: 8, title: 'Sunum yapısı: 3, 15 ve 45 dakika',
    body: [
      '3 dakikalık sunum (asansör konuşması): kim olduğun, neden başladığın ve karşındakine ne sunabileceğin. Sonunda soru: "Daha fazlasını görmek ister misin?"',
      '15 dakikalık sunum: kısa hikâyen, şirket ve ürün tanıtımı (resmi bilgilerle), iş modelinin nasıl çalıştığı, sorular. Birebir ya da online görüşmeler için idealdir.',
      '45 dakikalık sunum: ürün deneyimi, kazanç planının resmi anlatımı, eğitim ve destek sistemi, soru-cevap. Genellikle sponsor veya liderle birlikte yapılır. Kazanç planını anlatırken örnek rakamları "garanti" gibi sunma; şirketin resmi gelir açıklamalarını kullan.'
    ],
    points: ['Sunumun süresi adayın ilgisine göre seçilir.', 'Hikâye + ürün + model + soru.', 'Kazanç planında garanti dili yok.'],
    exercise: '3 dakikalık tanıtımını yaz, sesli kaydet ve dinle. Fazla olan her cümleyi çıkar.',
    quiz: [
      { q: '3 dakikalık sunum nasıl biter?', o: ['Kayıt formuyla', '"Daha fazlasını görmek ister misin?" sorusuyla', 'Fiyat listesiyle'], a: 1 },
      { q: 'Kazanç planını anlatırken doğru yaklaşım hangisi?', o: ['"Ayda şu kadar kazanırsın" demek', 'Resmi açıklamaları kullanıp garanti vermemek', 'Hiç anlatmamak'], a: 1 }
    ] },
  { id: 'd07', module: 'orta', minutes: 7, title: 'İtiraz yönetimi: "Vaktim yok", "Param yok", "Güvenmiyorum"',
    body: [
      'İtiraz çoğu zaman bir "hayır" değil, cevaplanmamış bir sorudur. Önce dinle, sonra kabul et ("Çok anlaşılır"), sonra asıl kaygıyı bulmak için soru sor.',
      '"Vaktim yok": Bu işin zaman istediğini dürüstçe söyle, küçük bir adım öner. "Param yok": "Para engeli olmasaydı ilgini çeker miydi?" diye sor; başlangıç maliyetini şeffaf anlat. "Güvenmiyorum": Araştırmasını takdir et, resmi belgeleri birlikte incelemeyi öner.',
      'Asla yapma: tartışmak, küçümsemek, baskı kurmak ya da itirazı "son şans" diye kapatmaya çalışmak.'
    ],
    points: ['Dinle → kabul et → soru sor → yanıtla.', 'İtiraz = cevaplanmamış soru.', 'Tartışma ve baskı yok.'],
    exercise: 'İletişim → Pratik bölümünde "Fiyata itiraz eden müşteri" senaryosunu bir kez çalış.',
    quiz: [
      { q: 'İtiraz yönetiminde ilk adım nedir?', o: ['Hemen cevap vermek', 'Dinlemek', 'Konuyu değiştirmek'], a: 1 },
      { q: '"Param yok" diyen birine en iyi soru hangisi?', o: ['"Kredi kartın yok mu?"', '"Para engeli olmasaydı ilgini çeker miydi?"', '"Bu fırsat kaçarsa üzülürsün"'], a: 1 }
    ] },
  { id: 'd08', module: 'orta', minutes: 6, title: 'Takip sistemi: kaç kez, nasıl, ne zaman bırakılır',
    body: [
      'Kararların çoğu ilk görüşmede değil, takiplerde verilir. Takip etmemek, harcadığın emeği masada bırakmaktır.',
      'Önerilen ritim: sunumdan sonra 24-48 saat içinde ilk takip, sonra 3-5 gün, sonra 1-2 hafta. Her takipte yeni bir değer sun: bir soruya cevap, bir etkinlik daveti, kısa bir video.',
      'Ne zaman bırakılır? Kişi açıkça istemediğini söylediğinde ya da 3-4 nazik takibe yanıt gelmediğinde. Kapıyı açık bırak ve 3-6 ay sonra ilişkiyi yokla. Kazanım\'daki "sonraki takip" tarihini her temasta mutlaka doldur.'
    ],
    points: ['Karar takiplerde verilir.', '24-48 saat → 3-5 gün → 1-2 hafta.', 'Açık "hayır" ya da 3-4 yanıtsız takipten sonra bırak.'],
    exercise: 'Kazanım → Bugün listesindeki tüm takipleri bu hafta tamamla.',
    quiz: [
      { q: 'Sunumdan sonra ilk takip ne zaman yapılmalı?', o: ['24-48 saat içinde', '1 ay sonra', 'Hiç yapılmamalı'], a: 0 },
      { q: 'Takibi ne zaman bırakmalısın?', o: ['İlk yanıtsız mesajdan sonra', 'Kişi açıkça istemediğini söylediğinde', 'Asla bırakmamalısın'], a: 1 }
    ] },
  { id: 'd09', module: 'orta', minutes: 5, title: 'Müşteri ve iş ortağı farkını anlatmak',
    body: [
      'Herkes iş ortağı olmak zorunda değildir ve olmamalıdır. Sağlıklı bir ekipte memnun müşteriler, işi kuran ortaklardan sayıca fazladır.',
      'Müşteri: ürünü kullanır, memnun kalırsa tekrar alır ve tavsiye eder. İş ortağı: ürünü kullanır, paylaşır, ekip kurar ve eğitimlere katılır.',
      'Adaya iki yolu da şeffaf göster ve seçimi ona bırak. "Önce müşteri ol, beğenirsen işi sonra konuşuruz" demek güven kazandırır. Müşteri sonrası takibi unutma ve cayma hakkını (30 gün) hatırlat.'
    ],
    points: ['Her aday iş ortağı değildir.', 'Müşteri yolu da değerli bir sonuçtur.', 'Seçimi adaya bırak.'],
    exercise: 'Hunideki "Sunum" aşamasındaki adaylarını gözden geçir: kim müşteri, kim iş ortağı adayı?',
    quiz: [
      { q: 'Sağlıklı bir ekipte hangisi daha çoktur?', o: ['Memnun müşteriler', 'Sadece iş ortakları', 'Pasif üyeler'], a: 0 },
      { q: 'Adaya yolları nasıl sunmalısın?', o: ['Sadece iş fırsatını anlatarak', 'İki yolu şeffaf gösterip seçimi ona bırakarak', 'Müşteriliği küçümseyerek'], a: 1 }
    ] },
  { id: 'd10', module: 'orta', minutes: 7, title: 'Sosyal medya ile organik büyüme',
    body: [
      'Sosyal medya bir vitrin değil, ilişki aracıdır. İnsanlar ürün reklamını değil, gerçek bir insanı takip eder.',
      'Basit içerik dengesi: yaşam ve kişisel gelişim, öğretici içerik, ürün deneyimi (sağlık iddiası olmadan), etkileşim soruları. Her gönderiyi satış çağrısına çevirme.',
      'Organik büyüme = etkileşim. Yorumlara cevap ver, başkalarının paylaşımlarına içtenlikle yorum yap, DM\'de sohbeti ilişkiye dönüştür. Takip-bırak taktikleri kalitesiz kitle ve düşük erişim getirir. Pazarlama birimindeki içerik takvimini haftalık kullan.'
    ],
    points: ['İnsanlar insanı takip eder.', 'İçerik dengesi: yaşam, öğretici, deneyim, etkileşim.', 'Takip-bırak taktiği yok.'],
    exercise: 'Pazarlama → İçerik takvimine önümüzdeki hafta için 3 gönderi planla.',
    quiz: [
      { q: 'Organik büyümenin anahtarı nedir?', o: ['Etkileşim ve ilişki', 'Takip-bırak', 'Her gün ürün reklamı'], a: 0 },
      { q: 'Ürün deneyimi paylaşırken hangisinden kaçınmalısın?', o: ['Kendi deneyimini anlatmaktan', 'Sağlık iddiası yapmaktan', 'Fotoğraf paylaşmaktan'], a: 1 }
    ] },
  // ===================== İLERİ =====================
  { id: 'd11', module: 'ileri', minutes: 7, title: 'Liderlik geliştirme ve duplikasyon',
    body: [
      'Duplikasyon, yaptığın işin ekibin tarafından kopyalanabilmesidir. Senin yapabildiğin ama ekibinin yapamadığı her şey büyümeyi senin zamanınla sınırlar.',
      'Basit bir sistem kopyalanır: sıcak liste, şablonlu ilk temas, davet, üçlü görüşme, takip, haftalık hesap verme. Bu uygulamanın birimleri tam olarak bu adımları taşır.',
      'Lider; yapan, öğreten ve yaptırandır. Yeni üyeyle ilk sunumları birlikte yap, sonra o yapsın sen izle, en son o başkasına öğretsin.'
    ],
    points: ['Kopyalanamayan büyümez.', 'Basit sistem > karizma.', 'Yap → birlikte yap → izle → öğret.'],
    exercise: 'Ekibindeki bir kişiyle bu hafta birlikte bir sunum planla.',
    quiz: [
      { q: 'Duplikasyon ne demektir?', o: ['İşin ekip tarafından kopyalanabilmesi', 'Aynı kişiyi iki kez kaydetmek', 'Ürünü iki kez satmak'], a: 0 },
      { q: 'Yeni üyeye öğretmenin doğru sırası hangisi?', o: ['Sadece video izlet', 'Birlikte yap → izle → o öğretsin', 'Tek başına bırak'], a: 1 }
    ] },
  { id: 'd12', module: 'ileri', minutes: 6, title: 'Ekip motivasyonu ve tutundurma',
    body: [
      'Yeni üyelerin önemli bir kısmı ilk 90 günde bırakır. En büyük neden; ne yapacağını bilmemek, ilk sonuçları görememek ve yalnız hissetmektir.',
      'Tutundurmanın üç ayağı: net ilk adımlar (İlk 14 gün listesi), erken küçük başarılar (ilk temas, ilk sunum) ve düzenli temas (haftalık kısa görüşme).',
      'Tanınma güçlü bir motivasyondur: küçük adımları da görünür kıl ve kutla. Ama sahte heyecan, abartılı başarı hikâyeleri ve baskı kısa vadede işe yarar gibi görünür, uzun vadede güveni bitirir.'
    ],
    points: ['İlk 90 gün kritiktir.', 'Net adım + erken başarı + düzenli temas.', 'Gerçek tanınma, sahte heyecan değil.'],
    exercise: 'Ekip → Ekibim\'de "sessiz" görünen bir üyeye bugün destek mesajı gönder.',
    quiz: [
      { q: 'Yeni üyelerin bırakmasının en yaygın nedeni nedir?', o: ['Ne yapacağını bilmemek ve yalnız hissetmek', 'Çok fazla kazanmak', 'Ürünlerin fazla olması'], a: 0 },
      { q: 'Hangisi tutundurmaya zarar verir?', o: ['Küçük başarıları kutlamak', 'Abartılı başarı hikâyeleri ve baskı', 'Haftalık kısa görüşme'], a: 1 }
    ] },
  { id: 'd13', module: 'ileri', minutes: 6, title: 'Kişisel marka inşası',
    body: [
      'Kişisel marka, insanların sen yokken senin hakkında söylediğidir. NM\'de güven, ürün ve şirketten önce sana duyulur.',
      'Tutarlılık markanın temelidir: aynı ton, aynı değerler, düzenli paylaşım. Bir sloganın ve görsel kimliğin olsun; gerçekçi ve samimi bir dil kullan.',
      'Markanı zedeleyen şeyler: abartılı kazanç gösterileri, sağlık iddiaları, herkese aynı kopyala-yapıştır mesajı atmak ve sözünü tutmamak.'
    ],
    points: ['Güven önce sana duyulur.', 'Tutarlılık: ton, değer, düzen.', 'Abartı ve iddia markayı yıkar.'],
    exercise: 'Markanı 3 kelimeyle tanımla ve son 9 paylaşımının bu kelimelere uyup uymadığını kontrol et.',
    quiz: [
      { q: 'Kişisel markanın temeli nedir?', o: ['Tutarlılık', 'Takipçi sayısı', 'Pahalı ekipman'], a: 0 },
      { q: 'Hangisi markaya zarar verir?', o: ['Samimi dil', 'Abartılı kazanç gösterileri', 'Düzenli paylaşım'], a: 1 }
    ] },
  { id: 'd14', module: 'ileri', minutes: 7, title: 'Sistem kurma: bağımsız çalışan ekip',
    body: [
      'Bağımsız ekip, sen olmadan da doğru adımları atan ekiptir. Bunun için bilgiyi kişilere değil sisteme koy: ortak şablonlar, eğitim programı, takvim ve ölçüm.',
      'Ritüeller kur: haftalık ekip toplantısı, aylık online sunum, yeni üye karşılama görüşmesi. Bu uygulamada ekip etkinlikleri, paylaşılan şablonlar ve Akademi bunun için var.',
      'Liderler yetiştir: ekipte sorumluluk almaya istekli kişilere lider rolü ver, onların da davet linki oluşturabilmesini sağla. Senin görevin zamanla oyuncudan koça dönüşmektir.'
    ],
    points: ['Bilgiyi kişiye değil sisteme koy.', 'Haftalık/aylık ritüeller.', 'Oyuncudan koça geçiş.'],
    exercise: 'Ekip → Takvim\'de bu ay için bir ekip etkinliği oluştur.',
    quiz: [
      { q: 'Bağımsız ekip kurmanın anahtarı nedir?', o: ['Bilgiyi sisteme koymak', 'Her şeyi kendin yapmak', 'Hiç toplantı yapmamak'], a: 0 },
      { q: 'Liderin zamanla dönüşmesi gereken rol nedir?', o: ['Tek satış yapan kişi', 'Koç', 'Pasif üye'], a: 1 }
    ] },
  { id: 'd15', module: 'ileri', minutes: 6, title: 'Üst basamaklara çıkış stratejisi',
    body: [
      'Kariyer basamakları şirketin resmi planında tanımlıdır; kuralları en güncel resmi dokümandan öğren ve ekibine de oradan anlat.',
      'Strateji üç sorudan oluşur: Bir sonraki basamak için hangi koşullar gerekiyor? Bugünkü durumum ne? Aradaki farkı kapatmak için haftalık hangi aktiviteler gerekiyor? Hedefi Ölçüm biriminde haftalık eylemlere çevir.',
      'Basamak hedefi ekibi zorlamak için bahane olmamalı. Kimseye ihtiyacı olmayan ürün aldırma, kimseyi stok yapmaya zorlama. Sürdürülebilir büyüme gerçek müşteri ve gerçek aktiviteden gelir.'
    ],
    points: ['Kurallar resmi plandan öğrenilir.', 'Hedef → fark → haftalık eylem.', 'Stok ve zorla alım yok.'],
    exercise: 'Bir sonraki kariyer basamağının koşullarını resmi plandan çıkar ve Ölçüm → Hesap verme\'de 3 eyleme dönüştür.',
    quiz: [
      { q: 'Kariyer koşullarını nereden öğrenmelisin?', o: ['Şirketin güncel resmi planından', 'Sosyal medya yorumlarından', 'Tahminle'], a: 0 },
      { q: 'Hangisi sürdürülebilir değildir?', o: ['Gerçek müşteri kazanmak', 'Ekibi stok yapmaya zorlamak', 'Haftalık aktivite'], a: 1 }
    ] }
];

export const lessonById = id => LESSONS.find(l => l.id === id);
export const PASS_RATIO = 0.5; // yarısı ve üstü doğruysa ders tamamlanır
