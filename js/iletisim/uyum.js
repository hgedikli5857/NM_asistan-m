// Uyum (compliance) kontrolü: mesajda yasal/etik risk taşıyan ifadeleri bulur.
// Dayanak: Doğrudan Satışlar Hakkında Yönetmelik (hızlı zenginlik vaadi, yanıltıcı bilgi ve
// baskı yasak), gıda takviyesi / kozmetik ürünlerde sağlık beyanı kuralları.
// Bu bir yardımcıdır, hukuki görüş değildir.

const RULES = [
  {
    cat: 'Sağlık iddiası', level: 'yuksek',
    tip: 'Ürünler ilaç değildir. "Destekler", "kullanıcı deneyimi" gibi ifadeler bile dikkat ister; hastalık adı anma.',
    patterns: [
      /tedavi\s*(eder|edi|ed[iı]yor|sağlar)/i, /iyile[şs]tir/i, /şifa/i, /\bgeçir(ir|di|iyor)/i,
      /kanser/i, /diyabet|şeker hastal/i, /tansiyon/i, /kolesterol/i, /romatizma|fıtık|migren/i,
      /ilaç\s*(yerine|gibi|gerek)/i, /ilac[ıi]\s*b[ıi]rak/i, /ağr[ıi](y[ıi])?\s*(kes|geçir|yok\s*et|biter)/i,
      /kilo\s*verdir/i, /zayıflat/i, /bağışıklı[gğ][ıi]\s*güçlendir/i, /mucize/i
    ]
  },
  {
    cat: 'Kazanç vaadi', level: 'yuksek',
    tip: 'Kazanç rakamı, garanti veya "kolay para" vaadi verme. Gelirin emek ve satışa bağlı olduğunu söyle.',
    patterns: [
      /garanti(li)?\s*(kazanç|gelir|para)/i, /kesin\s*(kazan|gelir|para)/i, /zengin\s*ol/i,
      /pasif\s*gelir/i, /otur(arak)?\s*kazan/i, /hiç\s*çalışmadan|emeksiz|zahmetsiz/i,
      /kolay\s*para|hızlı\s*para|çabuk\s*zengin/i, /ayda\s*[\d.]+\s*(bin|k)?\s*(tl|₺|lira)/i,
      /[\d.]+\s*(bin|k)?\s*(tl|₺|lira)\s*kazan/i, /finansal\s*özgürlü[kğ]/i, /işini\s*bırak(abilir|ırsın|acaksın|man\s*için)/i
    ]
  },
  {
    cat: 'Baskı / acele ettirme', level: 'orta',
    tip: 'Karar için zaman tanı. Yönetmelik sisteme katılımda baskıyı yasaklar.',
    patterns: [/son\s*şans/i, /sadece\s*bugün/i, /hemen\s*karar/i, /kaçırma(yın)?\b/i, /acele\s*et(in)?\s*!|acele\s*etmelisin|acele\s*etmen\s*(lazım|gerek)/i, /yer(ler)?\s*doluyor/i, /bugün\s*kayıt\s*ol(mazsan)?/i]
  },
  {
    cat: 'Yanıltıcı kesinlik', level: 'orta',
    tip: '"%100", "risksiz", "herkeste işe yarar" gibi kesin ifadeler yanıltıcı sayılabilir.',
    patterns: [/%\s*100|yüzde\s*yüz/i, /risk(siz|\s*yok)/i, /herkes(te|e)\s*(işe\s*yarar|olur)/i, /yan\s*etkisi?\s*yok/i]
  }
];

export function checkMessage(text) {
  const findings = [];
  const value = String(text || '');
  for (const rule of RULES) {
    const hits = new Set();
    for (const re of rule.patterns) {
      const m = value.match(re);
      if (m) hits.add(m[0].trim());
    }
    if (hits.size) findings.push({ cat: rule.cat, level: rule.level, tip: rule.tip, hits: [...hits] });
  }
  return findings;
}

export function fillTemplate(body, { isim = '', ben = '' } = {}) {
  return String(body || '')
    .replace(/\{isim\}/g, isim || '[isim]')
    .replace(/\{ben\}/g, ben || '[adın]');
}
