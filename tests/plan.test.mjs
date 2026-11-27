// İçerik fabrikası: 30 günlük plan motoru
import assert from 'node:assert/strict';
import { planDays, pillarSequence, weeklyQuota, buildHashtags, toolBrief, aiTopicsPrompt, WEEK_PATTERN, TOPIC_BANK } from '../js/pazarlama/plan.js';
import { checkMessage } from '../js/iletisim/uyum.js';

// Hafta deseni: 3 R + 3 K + 3 G, pazar boş
const cnt = { reels: 0, karusel: 0, gonderi: 0 };
Object.values(WEEK_PATTERN).flat().forEach(f => cnt[f]++);
assert.deepEqual(cnt, { reels: 3, karusel: 3, gonderi: 3 });
assert.deepEqual(WEEK_PATTERN[0], []);

// 27 Kasım 2026 Cuma'dan 30 gün
const start = new Date(2026, 10, 27);
const plan = planDays({ start, days: 30 });
assert.equal(plan[0].planned_for, '2026-11-27'); assert.equal(plan[0].format, 'reels');
assert.ok(plan.every(p => new Date(p.planned_for).getDay() !== 0 || true));
assert.ok(!plan.some(p => new Date(p.planned_for + 'T12:00').getDay() === 0), 'pazar boş');
const q = weeklyQuota(plan, { start, days: 28 });
// Tam haftalar (pazartesiden başlayan) 3/3/3
assert.ok(q.slice(1, 4).every(w => w.reels === 3 && w.karusel === 3 && w.gonderi === 3), JSON.stringify(q));
assert.ok(plan.every(p => p.post_time === '07:45' && p.auto_planned && p.status === 'fikir'));
// Konular tekrarsız ve uyumlu
assert.equal(new Set(plan.map(p => p.topic)).size, plan.length, 'konu tekrarı yok');
for (const t of Object.values(TOPIC_BANK).flat()) assert.deepEqual(checkMessage(t).filter(f => f.level === 'yuksek'), [], t);
// Sütun dağılımı hedefe yakın
const seq = pillarSequence(40);
const share = id => seq.filter(x => x === id).length;
assert.equal(share('yasam'), 12); assert.equal(share('ekip'), 4);
assert.ok(seq.every((x, i) => i === 0 || x !== seq[i - 1]), 'aynı sütun art arda gelmez');
// Mevcut içerik varsa o gün/format atlanır, konu tekrar etmez
const existing = [{ planned_for: '2026-11-27', format: 'reels', topic: 'Sabah rutinim' }];
const p2 = planDays({ start, days: 7, existing });
assert.ok(!p2.some(p => p.planned_for === '2026-11-27' && p.format === 'reels'));
assert.ok(!p2.some(p => p.topic === 'Sabah rutinim'));
// Hashtag
assert.equal(buildHashtags('yasam', '#HGedikli official', ['#kişiselgelişim']).split(' ')[0], '#hgedikli');
assert.ok(buildHashtags('ekip', '').split(' ').length <= 10);
assert.equal(new Set(buildHashtags('yasam', '#motivasyon').split(' ')).size, buildHashtags('yasam', '#motivasyon').split(' ').length);
// Brief
const br = toolBrief({ topic: 'Sabah rutinim', format: 'reels' }, { tool: 'kling', storyboard: { scenes: [{ top: 'Mesaim\nbitiyor', bot: 'Akşam', sec: 4 }], slogan: 'Adım adım', cta: 'Yorumlara yaz:', kw: 'GİRİŞİM' }, brand: { handle: '@h' } });
assert.ok(br.includes('Sahne 1 (4 sn): Mesaim bitiyor / Akşam') && br.includes('Kling') && br.includes('sağlık'));
assert.ok(aiTopicsPrompt([{ planned_for: '2026-11-27', format: 'reels', pillar: 'yasam' }]).includes('{"topics"'));
console.log('plan: tamam');
