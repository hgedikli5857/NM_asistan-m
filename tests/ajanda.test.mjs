// Ajanda: kaynakların birleştirilmesi, günlere bölme
import assert from 'node:assert/strict';
import { buildAgenda, groupByDay, timeLabel, nextUp, dayKey } from '../js/ajanda/model.js';

const now = new Date(2026, 10, 21, 21, 0); // 21 Kas 2026 21:00 (yerel)
const iso = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const items = buildAgenda({
  appts: [{ id: 'a1', kind: 'sunum', title: 'Can ile sunum', starts_at: iso(22, 20), duration_min: 45, status: 'planli' },
          { id: 'a2', kind: 'sunum', title: 'İptal', starts_at: iso(22, 10), status: 'iptal' }],
  gEvents: [{ ext_id: 'g1', title: 'Ankara Buluşması', starts_at: iso(22, 17), ends_at: iso(22, 18), all_day: false },
            { ext_id: 'g2', title: 'Peak UP Vision', starts_at: new Date(2026, 10, 23).toISOString(), ends_at: new Date(2026, 10, 26).toISOString(), all_day: true },
            { ext_id: 'g0', title: 'Geçmiş', starts_at: iso(14, 21), ends_at: iso(14, 22) }],
  crmEvents: [{ id: 'c1', baslik: 'NewOmi Ankara', tur: 'tanisma_toplantisi', tarih_saat: iso(22, 13, 45), bitis_saat: iso(22, 16, 30), yer_tipi: 'yuz_yuze', semt: 'Çankaya', kayitli: 12, kontenjan: 100 }],
  prospects: [{ full_name: 'Zeynep', next_follow_up_at: iso(19, 10) }, { full_name: 'Ali', next_follow_up_at: iso(21, 12) }, { full_name: 'Veli', next_follow_up_at: iso(24, 12) }],
  tasks: [{ id: 't1', title: 'Teyit al', due_date: '2026-11-20' }, { id: 't2', title: 'Bitti', due_date: '2026-11-22', done_at: 'x' }],
  posts: [{ id: 'p1', topic: 'Sabah rutini', format: 'karusel', status: 'hazir', planned_for: '2026-11-22' }]
}, { now, days: 7 });

const keys = items.map(i => i.key);
assert.ok(!keys.includes('ap:a2'), 'iptal randevu görünmez');
assert.ok(!keys.some(k => k.startsWith('gg:g0')), 'geçmiş Google etkinliği görünmez');
assert.ok(!keys.includes('gt:t2'), 'tamamlanan görev görünmez');
const takipBugun = items.find(i => i.key === 'tk:2026-11-21');
assert.equal(takipBugun.title, 'Takip: 2 kişi (1 gecikmiş)');
assert.equal(takipBugun.sub, 'Zeynep, Ali');
assert.ok(items.find(i => i.key === 'gt:t1' && i.day === '2026-11-21' && i.late), 'gecikmiş görev bugüne');
// çok günlü tüm gün etkinliği 23-24-25'e yazılır
assert.deepEqual(items.filter(i => i.key.startsWith('gg:g2')).map(i => i.day), ['2026-11-23', '2026-11-24', '2026-11-25']);
// 22 Kasım sırası: önce tüm gün (içerik), sonra saatliler zaman sırasıyla
assert.deepEqual(items.filter(i => i.day === '2026-11-22').map(i => i.key), ['ic:p1', 'ce:c1', 'gg:g1', 'ap:a1']);
assert.equal(items.find(i => i.key === 'ce:c1').sub, 'Tanışma toplantısı · Çankaya · 12 kayıtlı / 100');
assert.equal(timeLabel(items.find(i => i.key === 'ap:a1')), '20:00–20:45');

const g = groupByDay(items, { now, days: 7 });
assert.equal(g[0].day, '2026-11-21'); assert.ok(g[0].today);
assert.ok(!g.some(x => x.day === '2026-11-26'), 'boş günler gösterilmez');
assert.equal(groupByDay([], { now, days: 7 }).length, 1, 'bugün boş olsa da görünür');
assert.equal(nextUp(items, now).key, 'ce:c1');
assert.equal(dayKey(now), '2026-11-21');
console.log('ajanda: tamam');
