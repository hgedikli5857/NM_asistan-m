// Karusel Stüdyosu: model, ayrıştırıcı, AI istemi
import assert from 'node:assert/strict';
import * as k from '../js/pazarlama/karusel.js';

// Örnek deste (beğenilen karuselin yapısı)
const d = k.sampleDeck({ web: 'https://www.ornek.com', handle: 'h.ornek' });
assert.equal(d.slides.length, 6);
assert.equal(d.slides[0].layout, 'kapak');
assert.equal(d.slides.at(-1).layout, 'kapanis');
assert.deepEqual([...new Set(d.slides.map(s => s.layout))].sort(), ['adim', 'fikir', 'kapak', 'kapanis', 'liste', 'uclu']);
assert.equal(d.brand.web, 'www.ornek.com');
assert.equal(d.brand.handle, '@h.ornek');
assert.deepEqual(k.deckFindings(d), [], 'Örnek karusel marka filtresinden geçmeli');

// Normalleştirme: sınırlar, maddesiz liste → fikir, varsayılan simge
const n = k.normalizeDeck({ slides: Array.from({ length: 14 }, (_, i) => ({ title: 'x'.repeat(200), layout: i === 3 ? 'liste' : undefined })) });
assert.equal(n.slides.length, k.MAX_SLIDES);
assert.equal(n.slides[0].title.length, 80);
assert.equal(n.slides[3].layout, 'fikir');
assert.equal(n.slides[0].layout, 'kapak');
assert.equal(n.slides.at(-1).layout, 'kapanis');
assert.equal(n.slides[1].emblem, 'sohbet');

// Zengin metin: *altın*
assert.deepEqual(k.richTokens('İkna yerine *fark ettirmeye* odaklan').map(t => [t.t, t.gold]),
  [['İkna', false], ['yerine', false], ['fark', true], ['ettirmeye', true], ['odaklan', false]]);
const lines = k.wrapTokens(k.richTokens('bir iki üç dört beş'), s => s.length * 10, 75);
assert.deepEqual(lines.map(l => l.map(t => t.t).join(' ')), ['bir iki', 'üç dört', 'beş']);

// "Ben vereyim": düz metin ayrıştırıcı
const txt = `[kapak] 8 Sayfalık Rehber
# Soru Sorarak *Güven* Kurmak
== Baskı kurmadan yönlendirme
Bu yaklaşımın amacı doğru sorularla ilerlemek.
> İkna yerine *fark ettir*.
---
[üçlü] 2. Strateji
# Doğru Niyet
Kısa paragraf.
- Baskı değil: İlgi
- Aktif dinleme: Güven
- Önce bağ: Sonra yön
---
# Sıcaklığa Göre Soru
- Sıcak çevre: Birlikte yapsaydık neye odaklanırdık?
- Ilık çevre: Zamanını neye ayırmak isterdin?
---
1. Dinle: Sözünü kesme.
2. Es ver: Hemen çözüm sunma.
3. Derinleştir: Alan tanı.
# Sessizlik
---
# Son söz
Takip edin.`;
const p = k.parseDeckText(txt);
assert.equal(p.slides.length, 5);
assert.equal(p.slides[0].layout, 'kapak');
assert.equal(p.slides[0].badge, '8 Sayfalık Rehber');
assert.equal(p.slides[0].ribbon, 'Baskı kurmadan yönlendirme');
assert.equal(p.slides[0].quote, 'İkna yerine *fark ettir*.');
assert.equal(p.slides[1].layout, 'uclu');
assert.equal(p.slides[1].items[1].label, 'Aktif dinleme');
assert.equal(p.slides[2].layout, 'liste');
assert.equal(p.slides[3].layout, 'adim');
assert.equal(p.slides[3].items[2].text, 'Alan tanı.');
assert.equal(p.slides[4].layout, 'kapanis');
// Başlıksız paragraftan başlık türetme
assert.equal(k.parseDeckText('İlk cümle burada. Sonra devam.\n---\na\n---\nb').slides[0].title, 'İlk cümle burada.');

// Marka filtresi karusel metninde çalışır
const bad = k.normalizeDeck({ slides: [{ title: 'Network marketing ile ek gelir' }, { title: 'b' }, { title: 'c' }] });
const cats = k.deckFindings(bad).map(f => f.cat);
assert.ok(cats.includes('Yasak terim') && cats.includes('Gelir ifadesi'));

// AI istemleri
const pr = k.aiDeckPrompt('Soru sorarak güven kurmak', 20);
assert.ok(pr.includes('10 sayfalık') && pr.includes('bireysel girişimcilik') && pr.includes('"slides"'));
assert.ok(k.aiStructurePrompt('benim metnim').includes('kelimelerini ve anlamını koru'));
assert.throws(() => k.parseAiDeck({ slides: [{}] }, d));
const ai = k.parseAiDeck({ slides: [{ layout: 'kapak', title: 'A' }, { layout: 'uclu', title: 'B', items: ['x', 'y', 'z'] }, { title: 'C' }] }, d);
assert.equal(ai.slides[1].items[0].text, 'x');
assert.equal(ai.brand.web, 'www.ornek.com');

// Açıklama metni ve dosya adı
const cap = k.suggestCaptionK(d);
assert.ok(cap.includes('Soru Sorarak Güven Kurmak') && cap.includes('@h.ornek') && !cap.includes('*'));
assert.equal(k.deckFileName('Soru Sorarak Güven', 2), 'karusel-soru-sorarak-guven-03.png');
console.log('karusel testleri geçti');
