// İletişim Masası (Günlük Çalışma Yöntemi) kabul testleri
import assert from 'node:assert/strict';
import * as m from '../js/iletisim/masa.js';

const now = Date.parse('2026-11-21T12:00:00Z');
const H = 3600e3;
const iso = ms => new Date(ms).toISOString();

// Soru / hassas tespiti
assert.equal(m.isQuestion('Etkinlik saat kaçta?'), true);
assert.equal(m.isQuestion('Konum atar mısınız'), true);
assert.equal(m.isQuestion('Fiyat bilgisi alabilir miyim'), true);
assert.equal(m.isQuestion('Teşekkürler, görüşürüz'), false);
assert.equal(m.isSensitive('Şu an param yok, maaş yatınca bakarım'), true);
assert.equal(m.isSensitive('Tamam yarın geliyorum'), false);

// Öncelik sırası (bölüm 4)
const P = (id, extra = {}) => ({ id, full_name: id, stage: 'temas', temperature: 'ilik', tags: [], ...extra });
const C = (pid, extra = {}) => ({ prospect_id: pid, lead_id: 'l' + pid, last_dir: 'gelen', last_in_at: iso(now - 2 * H), last_in_body: 'Tamam', in_24: 1, ...extra });
const prospects = [P('soru'), P('bekliyor'), P('eski', {}), P('bizden'), P('takip', { next_follow_up_at: iso(now - H) }), P('!gizli'), P('soguk', { temperature: 'soguk' }), P('etk'), P('hassas')];
const events = [{ id: 'e1', baslik: 'Ankara Buluşması', tarih_saat: iso(now + 22 * H), katilimcilar: [{ prospect_id: 'etk', durum: 'kayitli', kisi: 1 }] }];
const convs = [
  C('bekliyor', { last_in_body: 'Bakalım düşüneceğim' }),
  C('soru', { last_in_body: 'Adres neresi?' }),
  C('eski', { last_in_at: iso(now - 50 * H), last_in_body: 'Bakarım deneyeceğim' }),
  C('bizden', { last_dir: 'giden' }),
  C('!gizli', { last_in_body: 'saat kaç?' }),
  C('soguk', { last_dir: 'giden', last_in_at: iso(now - 80 * H) }),
  C('etk', { last_dir: 'giden', last_in_at: iso(now - 30 * H) }),
  C('hassas', { last_in_body: 'Şu an maddi olarak zorlanıyorum' })
];
const q = m.buildQueue({ convs, prospects, events, now });
const order = q.map(x => x.pid);
assert.equal(order[0], 'soru', 'Pencere açık + soru soran en üstte');
assert.ok(order.indexOf('bekliyor') < order.indexOf('eski'), 'Pencere açık olan, kapalıdan önce');
assert.ok(!order.includes('bizden'), 'Son mesaj bizden ve başka sebep yoksa sırada değil');
assert.ok(!order.includes('!gizli'), '"!" grupları dışarıda');
assert.ok(!order.includes('soguk'), 'Cevap beklemeyen soğuk kişi sırada değil');
assert.ok(order.includes('etk') && q.find(x => x.pid === 'etk').reasons.includes('Etkinlik teyidi'));
assert.ok(order.includes('takip') && q.find(x => x.pid === 'takip').reasons.includes('Takip günü'));
assert.ok(q.find(x => x.pid === 'hassas').reasons.includes('Hassas: önce dinle'));
assert.equal(q.find(x => x.pid === 'soru').windowOpen, true);
assert.equal(q.find(x => x.pid === 'eski').windowOpen, false);

// Etkinlik doğru bilgi + yanlış saat uyarısı (bölüm 9)
const ev = [{ baslik: 'Ankara Buluşması', tarih_saat: '2026-11-22T10:45:00Z', yer_tipi: 'yuz_yuze', semt: 'Çankaya', adres: 'X Cad. 5', katilimcilar: [{ prospect_id: 'p1', durum: 'kayitli', kisi: 2 }] }];
assert.equal(m.eventTime(ev[0].tarih_saat), '13:45');
const facts = m.eventFacts(ev, 'p1');
assert.ok(facts.includes('13:45') && facts.includes('Çankaya') && facts.includes('bu kişi kayıtlı'));
assert.deepEqual(m.eventMismatch('Yarın 13:45te Çankaya\'da görüşürüz', ev, 'p1'), []);
assert.equal(m.eventMismatch('Yarın 12.30\'da başlıyoruz', ev, 'p1')[0].hits[0], '12:30');
assert.deepEqual(m.eventMismatch('Saat 12:30', [], 'p1'), []);

// Rapor (format C)
const rows = m.reportRows({ gelen_mesaj: 14, gelen_kisi: 5, bot: { cevap: 3, hata: 1 }, giden: { gonderildi: 2, onay_bekliyor: 1 }, devir_bekleyen: 1 }, ev);
assert.equal(rows[0].value, '14 (5 kişi)');
assert.ok(rows[1].warn && rows[2].warn && rows[3].warn);
assert.ok(rows[4].value.includes('kayıtlı: 0') || rows[4].value.includes('kayıtlı:'));

// Gün sonu
const dc = m.dayClose([{ at: now, status: 'gonderildi' }, { at: now, status: 'cevap' }, { at: now }, { at: now - 48 * H, status: 'gonderildi' }],
  [{ olusturma: iso(now), durum: 'hata' }, { olusturma: iso(now), durum: 'bekliyor' }], now);
assert.deepEqual([dc.onaylanan, dc.gonderildi, dc.cevap, dc.isaretsiz, dc.kuyruk, dc.kuyrukBekleyen, dc.kuyrukHata], [3, 1, 1, 1, 2, 1, 1]);
// Kapanış mesajları ve eski mesajlar
for (const t of ['İyi günler size de.', 'teşekürler', 'Rica ederim', 'Anlaştık', 'Tamam teşekkürler', '🙏', 'Çok teşekkür ederim hocam']) assert.equal(m.isClosing(t), true, t);
for (const t of ['Teşekkürler, fiyatı ne kadar?', 'Bilmiyorum deneyin ablacım', 'kendini belirt']) assert.equal(m.isClosing(t), false, t);
assert.equal(m.isUnsupported('[desteklenmeyen mesaj türü]'), true);
const q2 = m.buildQueue({ now, events: [], prospects: [P('kapanis'), P('cokeski'), P('medya'), P('normal')], convs: [
  C('kapanis', { last_in_body: 'İyi günler size de.' }),
  C('cokeski', { last_in_at: iso(now - 20 * 24 * H), last_in_body: 'Bilgi alabilir miyim' }),
  C('medya', { last_in_body: '[desteklenmeyen mesaj türü]' }),
  C('normal', { last_in_body: 'Bilmiyorum deneyin' })] });
assert.deepEqual(q2.map(x => x.pid), ['normal', 'medya']);
console.log('masa testleri geçti');
