// AI rol yapma pratiği: senaryolar, istem (prompt) oluşturma ve Claude API çağrısı
export const SCENARIOS = [
  { id: 'soguk', title: 'Soğuk aday', icon: 'ti-snowflake', persona: 'Seni pek tanımayan, Instagram\'dan tanışılmış, kibar ama mesafeli biri. Kısa cevaplar verir, zamanı kıymetlidir.', opener: 'Merhaba, kusura bakma tanıyamadım, nereden tanışıyoruz?' },
  { id: 'sicak', title: 'Sıcak aday (eski arkadaş)', icon: 'ti-heart-handshake', persona: 'Uzun zamandır görüşmediğin eski bir okul arkadaşı. Samimi ama sohbetin bir anda "iş"e dönmesinden hoşlanmaz.', opener: 'Ooo nerelerdesin! Ne zamandır ses yok, nasılsın?' },
  { id: 'piramit', title: '"Piramit mi bu?" diyen şüpheci', icon: 'ti-alert-triangle', persona: 'İnternette olumsuz yorumlar okumuş, şüpheci, mantıklı sorular soran biri. Kanıt ister, baskıya tepki verir.', opener: 'Açık konuşayım, bu işler bana hep piramit gibi geliyor. Farkı ne?' },
  { id: 'fiyat', title: 'Fiyata itiraz eden müşteri', icon: 'ti-currency-lira', persona: 'Ürünleri beğenen ama fiyatı pahalı bulan, markette daha ucuzunu bulabileceğini düşünen biri.', opener: 'Ürünler güzel ama bu fiyata markette üç tane alırım bence.' },
  { id: 'kararsiz', title: 'Karar veremeyen ekip adayı', icon: 'ti-arrows-split', persona: 'Sunumu dinlemiş, ilgili ama kararsız; vakit, çevre ve başarısızlık korkusu var. "Düşüneyim" demeye meyilli.', opener: 'Anlattıkların mantıklı geldi ama bilmiyorum... Biraz düşüneyim mi?' },
  { id: 'eski', title: 'Eski bir NM\'ci (önyargılı)', icon: 'ti-history', persona: 'Daha önce başka bir şirkette denemiş, para kaybetmiş ve kırgın. Genelleme yapar, ama dinlenirse yumuşar.', opener: 'Ben bunu denedim, olmadı. Elimde stok kaldı. Bir daha asla.' }
];

export const MAX_TURNS = 6;

export function systemPrompt(sc) {
  return `Bir network marketing distribütörüyle rol yapma pratiği yapıyorsun. Sen şu karakteri canlandırıyorsun: ${sc.persona}
Kurallar:
- Türkçe, doğal ve kısa yaz (1-3 cümle), gerçek bir WhatsApp sohbeti gibi.
- Karakterden çıkma, koçluk yapma, geri bildirim verme.
- Distribütör baskı kurarsa, kazanç vaadi verirse ya da sağlık iddiasında bulunursa karakter olarak rahatsız ol ve geri çekil.
- İyi dinlenir ve sorularına dürüst yanıt alırsan yavaşça yumuşa; ama hemen ikna olma.`;
}

export function feedbackPrompt(sc, transcript) {
  return `Aşağıda bir network marketing distribütörünün "${sc.title}" senaryosundaki pratik konuşması var. Deneyimli, dürüst ama cesaretlendirici bir sponsor olarak değerlendir.
Tam olarak şu formatta, Türkçe yaz:
✅ İyi yaptıkların
- (en az 2 madde)
⚡ Geliştirmen gerekenler
- (en az 2 madde)
💡 Profesyonel alternatif ifade
- (konuşmadaki en zayıf cümlenin yerine söylenebilecek 1-2 örnek cümle)
Ölçütler: dinleme ve soru sorma, empati, şeffaflık, baskı yapmama, kazanç vaadi ve sağlık iddiası olmaması, görüşmeye davet etme.

Konuşma:
${transcript.map(m => `${m.role === 'user' ? 'Distribütör' : 'Aday'}: ${m.content}`).join('\n')}`;
}

// Claude Messages API çağrısı (anahtar kullanıcının tarayıcısında saklanır)
export async function callClaude(key, { system, messages, maxTokens = 400 }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: maxTokens, ...(system ? { system } : {}), messages })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  if (!text) throw new Error('Boş yanıt geldi');
  return text;
}

// API'ye gönderilecek mesaj listesi: aday (assistant) ilk konuşur; API kullanıcıyla başlamayı ister
export function apiMessages(sc, chat) {
  return [{ role: 'user', content: '(Sohbet başlıyor. İlk mesajı sen zaten yazdın.)' },
    { role: 'assistant', content: sc.opener }, ...chat];
}
