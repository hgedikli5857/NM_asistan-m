// İletişim birimi: sistem şablonları ve itiraz rehberi.
// Yazım ilkeleri: sağlık iddiası yok, kazanç vaadi yok, baskı yok. Amaç her zaman
// merak uyandırıp canlı bir görüşmeye davet etmek; her şeyi mesajda anlatmak değil.
// Yer tutucular: {isim} = adayın adı, {ben} = senin adın

export const PURPOSES = [
  { id: 'ilk_temas', label: 'İlk temas' },
  { id: 'davet', label: 'Davet' },
  { id: 'takip', label: 'Takip' },
  { id: 'randevu', label: 'Randevu' },
  { id: 'ekibe_davet', label: 'Ekibe davet' },
  { id: 'musteri', label: 'Müşteri sonrası' },
  { id: 'itiraz', label: 'İtiraz yanıtı' }
];
export const purposeLabel = id => PURPOSES.find(p => p.id === id)?.label || id;

// relation: 'yakin' | 'tanidik' | 'yabanci' | null (hepsi)
export const SYSTEM_TEMPLATES = [
  // ---------- İlk temas ----------
  { id: 's1', purpose: 'ilk_temas', relation: 'yakin', channel: 'WhatsApp', title: 'Yakın arkadaşa sıcak açılış',
    body: 'Selam {isim}! Aklıma geldin, nasılsın? Uzun zamandır doğru dürüst konuşamadık, bu hafta bir kahve içelim mi?' },
  { id: 's2', purpose: 'ilk_temas', relation: 'tanidik', channel: 'WhatsApp', title: 'Bir süredir görüşülmeyen tanıdık',
    body: 'Merhaba {isim}, ben {ben}. Bir süredir haberleşmedik, nasılsın? Neler yapıyorsun bu aralar?' },
  { id: 's3', purpose: 'ilk_temas', relation: 'yabanci', channel: 'Instagram', title: 'Instagram — paylaşımdan açılış',
    body: 'Merhaba {isim}! Paylaşımlarını bir süredir takip ediyorum, özellikle son paylaştığın çok hoşuma gitti. Bu konuya nasıl ilgi duymaya başladın?' },
  { id: 's4', purpose: 'ilk_temas', relation: 'yabanci', channel: 'Instagram', title: 'Story yanıtı',
    body: 'Ne güzel bir an yakalamışsın {isim}! Burası neresi?' },
  { id: 's5', purpose: 'ilk_temas', relation: 'tanidik', channel: 'Yüz yüze', title: 'Etkinlikte tanışılan kişi',
    body: 'Merhaba {isim}, geçen gün tanıştığımıza memnun oldum. Konuştuğumuz konu aklımda kaldı, bir ara devam edelim mi?' },

  // ---------- Davet ----------
  { id: 's6', purpose: 'davet', relation: 'yakin', channel: 'WhatsApp', title: 'Merak uyandıran davet',
    body: '{isim}, son zamanlarda üzerinde çalıştığım bir şey var ve senin fikrini gerçekten merak ediyorum. 20 dakikanı ayırıp bir bakar mısın? Beğenmezsen de hiç sorun değil.' },
  { id: 's7', purpose: 'davet', relation: 'tanidik', channel: 'WhatsApp', title: 'Fikir sorma daveti',
    body: 'Merhaba {isim}, sana açık açık sorayım: kendi bireysel girişimini kurmaya açık mısın? Açıksan kısa bir görüşmede ne yaptığımı anlatayım, değilse hiç dert değil.' },
  { id: 's8', purpose: 'davet', relation: null, channel: 'WhatsApp', title: 'Online sunuma davet',
    body: '{isim}, bu perşembe akşam kısa bir online tanıtım yapıyoruz, 30 dakika sürüyor. Hem ürünleri hem iş modelini görebilirsin. Linki göndereyim mi?' },
  { id: 's9', purpose: 'davet', relation: null, channel: null, title: 'Ürün tanıtımına davet',
    body: '{isim}, kullandığım kişisel bakım ve temizlik ürünlerini görmek ister misin? Bir ara 15 dakikalığına göstereyim, kendin karar verirsin.' },

  // ---------- Takip ----------
  { id: 's10', purpose: 'takip', relation: null, channel: 'WhatsApp', title: 'Sunum sonrası ilk takip',
    body: 'Merhaba {isim}, dünkü görüşme için tekrar teşekkürler. En çok hangi kısım aklında kaldı? Sorun varsa hemen cevaplayayım.' },
  { id: 's11', purpose: 'takip', relation: null, channel: 'WhatsApp', title: 'Cevap gelmeyen mesaj için nazik takip',
    body: '{isim}, yoğun olduğunu tahmin ediyorum, acelesi yok. Uygun olduğunda kısa bir dönüş yaparsan sevinirim.' },
  { id: 's12', purpose: 'takip', relation: null, channel: 'WhatsApp', title: '"Düşüneyim" diyene takip',
    body: 'Merhaba {isim}, geçen konuştuğumuzda düşünmek istediğini söylemiştin, çok da doğru. Aklına takılan bir soru olduysa birlikte bakalım mı?' },
  { id: 's13', purpose: 'takip', relation: null, channel: 'WhatsApp', title: 'Kapıyı açık bırakan son takip',
    body: '{isim}, seni daha fazla meşgul etmek istemem. Şu an senin için doğru zaman olmayabilir, tamamen anlıyorum. İleride merak edersen ben buradayım.' },

  // ---------- Randevu ----------
  { id: 's14', purpose: 'randevu', relation: null, channel: 'WhatsApp', title: 'İki seçenekli randevu',
    body: '{isim}, görüşme için salı 19:00 mı yoksa perşembe 20:00 mı daha uygun olur?' },
  { id: 's15', purpose: 'randevu', relation: null, channel: 'WhatsApp', title: 'Randevu hatırlatma',
    body: 'Merhaba {isim}, yarınki görüşmemizi hatırlatmak istedim. Hâlâ uygun musun? Bir değişiklik olursa haber vermen yeterli.' },
  { id: 's16', purpose: 'randevu', relation: null, channel: 'WhatsApp', title: 'Gelemeyen kişiye yeni tarih',
    body: '{isim}, bugün denk gelmedi, hiç sorun değil. Bu hafta senin için hangi gün daha rahat olur?' },

  // ---------- Ekibe davet ----------
  { id: 's17', purpose: 'ekibe_davet', relation: null, channel: 'WhatsApp', title: 'Ürünü seven müşteriye iş fırsatı',
    body: '{isim}, ürünlerden memnun kaldığını söylemiştin. Bunu çevrenle paylaşıp bireysel girişimcilik olarak yapmanın da bir yolu var. Nasıl işlediğini 20 dakikada anlatayım mı? Sonra karar tamamen senin.' },
  { id: 's18', purpose: 'ekibe_davet', relation: 'yakin', channel: 'WhatsApp', title: 'Birlikte çalışma teklifi',
    body: '{isim}, bu işi birlikte yapmayı gerçekten isterim. İnsanlarla iletişimin çok güçlü. Rakam vaadi vermeyeceğim; nasıl çalıştığımı ve ne kadar emek istediğini dürüstçe anlatayım. Konuşalım mı?' },

  // ---------- Müşteri sonrası ----------
  { id: 's19', purpose: 'musteri', relation: null, channel: 'WhatsApp', title: 'Sipariş sonrası memnuniyet',
    body: 'Merhaba {isim}, siparişin eline ulaştı mı? Kullanırken bir sorun olursa ya da sorun olursa bana yazman yeterli.' },
  { id: 's20', purpose: 'musteri', relation: null, channel: 'WhatsApp', title: 'Cayma hakkı bilgisi',
    body: '{isim}, bilgin olsun: doğrudan satışla aldığın ürünlerde 30 gün içinde koşulsuz cayma hakkın var. İçin rahat olsun, memnun kalmazsan birlikte iade süreçlerini hallederiz.' },
  { id: 's21', purpose: 'musteri', relation: null, channel: 'WhatsApp', title: 'Tavsiye isteme',
    body: '{isim}, ürünlerden memnun kaldıysan çok sevindim. Çevrende bu ürünleri merak edebilecek biri aklına gelir mi?' }
];

// İtiraz rehberi: her itirazın arkasındaki gerçek kaygı, yaklaşım ve örnek yanıt
export const OBJECTIONS = [
  {
    id: 'piramit', title: '"Bu piramit değil mi?"',
    behind: 'Kandırılmaktan korkuyor. Haklı bir soru; çevresinde kötü örnek görmüş olabilir.',
    steps: ['Soruyu takdir et, savunmaya geçme.', 'Farkı açıkla: piramitte satılan gerçek bir ürün yoktur, kazanç yalnızca üye kaydından gelir; Türkiye\'de yasaktır.', 'Kontrol etme yolunu göster: şirketin Ticaret Bakanlığı doğrudan satış yetki belgesini kendisi sorgulayabilir.', 'Görüşmeye davet et.'],
    reply: '{isim}, bu soruyu sorman çok doğru, ben de başta sordum. Piramit sistemlerde gerçek bir ürün yoktur, para sadece yeni üye kaydından elde edilir ve Türkiye\'de yasaktır. Bizde ürün satışı esastır. Şirketin doğrudan satış yetki belgesini Ticaret Bakanlığı üzerinden kendin de kontrol edebilirsin. İstersen birlikte bakalım.'
  },
  {
    id: 'vakit', title: '"Vaktim yok"',
    behind: 'Ya gerçekten yoğun ya da henüz yeterince ilgilenmedi. Zorlamak yerine gerçekçi zamanı sor.',
    steps: ['Yoğunluğunu kabul et.', 'Ne kadar zaman gerektiğini dürüstçe söyle; "hiç emek istemez" deme.', 'Küçük bir adım öner: 20 dakikalık görüşme.'],
    reply: '{isim}, ne kadar yoğun olduğunu biliyorum. Sana dürüst olayım: bu iş zaman ve emek istiyor, sihirli bir yanı yok. Ama başlamak için önce sadece 20 dakikalık bir görüşme yeterli, sonra uyup uymadığına sen karar verirsin. Bu hafta hangi akşam daha rahatsın?'
  },
  {
    id: 'para', title: '"Param yok"',
    behind: 'Bütçe kaygısı ya da risk algısı. Baskı kurma; seçenekleri şeffaf anlat.',
    steps: ['Empati kur.', 'Asıl soruyu sor: para engeli olmasa ilgilenir miydi?', 'Başlangıç maliyetini net ve dürüst söyle; "bedava" ya da "kesin geri kazanırsın" deme.', 'Karar için zaman tanı.'],
    reply: '{isim}, bu çok anlaşılır bir kaygı. Sana bir şey sorayım: para tarafı bir engel olmasaydı ilgini çeker miydi? Çekiyorsa başlangıç seçeneklerini ve maliyetini açık açık göstereyim, acele etmeden birlikte değerlendirelim.'
  },
  {
    id: 'guven', title: '"Güvenmiyorum / İnternette kötü yorumlar var"',
    behind: 'Araştırıyor; bu iyi bir işaret. Bilgi ve kanıt istiyor.',
    steps: ['Araştırmasını takdir et.', 'Resmi bilgilere yönlendir (yetki belgesi, şirket sözleşmesi).', 'Kendi deneyimini abartmadan anlat.', 'Karar hakkının onda olduğunu vurgula.'],
    reply: '{isim}, araştırman çok doğru, ben de başlamadan önce çok okudum. Her şirkete olumlu da olumsuz da yorum yazılıyor. Resmi belgeleri ve sözleşmeyi birlikte inceleyelim, ben de kendi deneyimimi abartmadan anlatayım. Kararı sen verirsin.'
  },
  {
    id: 'dusuneyim', title: '"Düşüneyim"',
    behind: 'Genellikle cevaplanmamış bir soru vardır. Ne olduğunu nazikçe öğren.',
    steps: ['Düşünmesine saygı göster.', 'Aklına takılan noktayı sor.', 'Net bir takip zamanı belirle.'],
    reply: '{isim}, tabii ki düşün, acele etmeni hiç istemem. Aklında en çok takılan şey ne? Onu cevaplarsam düşünmen kolaylaşır. İstersen cuma günü kısaca konuşalım.'
  },
  {
    id: 'deneyim', title: '"Ben satış yapamam / Deneyimim yok"',
    behind: 'Kendine güvenmiyor ya da satışı "insanlara yük olmak" gibi görüyor.',
    steps: ['Çoğu kişinin deneyimsiz başladığını söyle.', 'Eğitim ve destek sistemini anlat.', 'İşin, ürünü kullanıp deneyimini paylaşmak olduğunu açıkla.'],
    reply: '{isim}, ben de hiç deneyimim olmadan başladım. Kimseyi ikna etmeye çalışmıyorum; kullandığım ürünleri ve deneyimimi paylaşıyorum. Başlayanlar için adım adım bir eğitim süreci var, ilk adımları birlikte atarız.'
  },
  {
    id: 'cevre', title: '"Çevrem ne der?"',
    behind: 'Yargılanmaktan çekiniyor.',
    steps: ['Hissini normalleştir.', 'Önce müşteri olarak deneyim kazanmasını öner.', 'Kimseyi zorlamadan paylaşmanın mümkün olduğunu anlat.'],
    reply: '{isim}, bu hissi çok iyi anlıyorum, ben de yaşadım. İstersen önce sadece ürünleri kullan, kendi deneyimini oluştur. Paylaşmak istediğinde zorlamadan, doğal bir şekilde nasıl yapılacağını birlikte konuşuruz.'
  },
  {
    id: 'zaten_is', title: '"Zaten bir işim var"',
    behind: 'Mevcut işini bırakması gerektiğini sanıyor olabilir.',
    steps: ['İşini bırakmasının beklenmediğini söyle.', 'Kaç saat ayırabileceğini sor.', 'Rakam vaadi vermeden gerçekçi bir tablo çiz.'],
    reply: '{isim}, işini bırakmanı kimse beklemiyor; ekipteki çoğu kişi işinin yanında yapıyor. Haftada ne kadar zaman ayırabileceğini konuşalım, ona göre gerçekçi bir başlangıç planı çıkaralım.'
  },
  {
    id: 'denedim', title: '"Daha önce böyle bir iş denedim, olmadı"',
    behind: 'Kötü bir deneyim yaşamış. Önce dinle.',
    steps: ['Ne olduğunu sor ve dinle.', 'O deneyimden ne öğrendiğini sor.', 'Farklı yaklaşımını abartmadan anlat.'],
    reply: '{isim}, bunu paylaştığın için teşekkürler. Ne oldu, neden olmadı? Merak ediyorum, çünkü yaşadıkların çok değerli. Sonra benim nasıl çalıştığımı anlatayım, farkı kendin değerlendir.'
  },
  {
    id: 'pahali', title: '"Ürünler pahalı"',
    behind: 'Değeri henüz görmemiş ya da karşılaştırma yapıyor.',
    steps: ['Fiyat kaygısını kabul et.', 'Küçük bir başlangıç ürünü öner.', 'Cayma hakkını hatırlat (30 gün).'],
    reply: '{isim}, haklısın, fiyat önemli. İstersen tek bir üründen başla, kendin dene. Ayrıca doğrudan satışta 30 gün koşulsuz cayma hakkın var, yani içine sinmezse iade edebilirsin.'
  },
  {
    id: 'saglik', title: '"Sağlık sorunum var, işe yarar mı?"',
    behind: 'Bir çözüm arıyor. DİKKAT: Sağlık iddiası yapmak yasal ve etik risk taşır.',
    steps: ['Asla "tedavi eder, iyileştirir, geçirir" deme.', 'Ürünlerin ilaç olmadığını açıkça söyle.', 'Doktoruna danışmasını öner.', 'Sadece ürünün resmi açıklamasını paylaş.'],
    reply: '{isim}, sağlığın her şeyden önemli. Şunu açıkça söylemeliyim: bu ürünler ilaç değil ve sağlığınla ilgili bir söz veremem. Kullanmayı düşünürsen önce doktoruna danışmanı rica ederim. Ürünün resmi bilgilerini istersen paylaşırım.'
  },
  {
    id: 'ilgi', title: '"İlgilenmiyorum"',
    behind: 'Şu an değil. Saygı göster, ilişkiyi koru.',
    steps: ['Kararına saygı göster.', 'İlişkiyi koru; ısrar etme.', '3-6 ay sonra nazik bir takip planla.'],
    reply: '{isim}, anlıyorum, hiç sorun değil. Açık konuştuğun için teşekkürler. Aramızdaki dostluk her şeyden önemli; ileride merak edersen ben buradayım.'
  }
];
