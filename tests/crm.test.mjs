// CRM köprüsü saf fonksiyon testleri
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// supabase.js ve ui.js bağımlılıklarını taklit et
const dir = mkdtempSync(join(tmpdir(), 'crm-'));
mkdirSync(join(dir, 'crm'));
writeFileSync(join(dir, 'supabase.js'), 'export const supabase = {};');
writeFileSync(join(dir, 'ui.js'), "export const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));");
writeFileSync(join(dir, 'crm', 'client.js'), readFileSync(new URL('../js/crm/client.js', import.meta.url)));
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = v; } };
const m = await import(join(dir, 'crm', 'client.js'));

// resultText
assert.equal(m.resultText({ yeni: 3, guncellenen: 40, atlanan_korunan: 23 }), '3 yeni aday · 40 güncellendi · 23 korunan kişi atlandı');
assert.equal(m.resultText({ yeni: 0 }), 'Değişiklik yok');

// autoSyncDue
assert.equal(m.autoSyncDue(10 * 60 * 1000, 0), false);
assert.equal(m.autoSyncDue(31 * 60 * 1000, 0), true);

// crmWaiting: bekleyenler, en yeni önce
const P = (id, conv) => ({ id, extra: conv ? { crm: { id: 'c' + id, conv } } : {} });
const list = [
  P(1, { handoff_status: 'bekliyor', last_message_at: '2026-11-19T10:00:00Z' }),
  P(2, { handoff_status: 'yok', unread_count: 2, handler: 'bot' }),
  P(3, { handoff_status: 'ustlenildi', unread_count: 1, handler: 'human', last_message_at: '2026-11-20T10:00:00Z' }),
  P(4, null)
];
assert.deepEqual(m.crmWaiting(list).map(p => p.id), [3, 1]);

// crmSummaryHTML: kaçış ve içerik
const html = m.crmSummaryHTML({ source: 'Reels', conv: { handler: 'bot', preview: '<script>x</script>', last_message_at: '2026-11-20T10:00:00Z', msg_count: 4 } }, 'abc');
assert.ok(html.includes('Bot yönetiyor'));
assert.ok(html.includes('data-id="abc"'));
assert.ok(!html.includes('<script>'));
assert.ok(html.includes('(4)'));
assert.equal(m.crmSummaryHTML(null, 'x'), '');

// messagesHTML
const mh = m.messagesHTML([{ direction: 'gelen', sender_type: 'lead', body: 'Merhaba <b>', created_at: '2026-11-20T10:00:00Z' },
  { direction: 'giden', sender_type: 'bot', body: null, content_type: 'image', created_at: '2026-11-20T10:01:00Z' }]);
assert.ok(mh.includes('msg in') && mh.includes('msg out'));
assert.ok(mh.includes('&lt;b&gt;') && mh.includes('[image]'));
assert.ok(m.messagesHTML([]).includes('bulunamadı'));
console.log('crm testleri geçti');

// Cevap öner konuşma yardımcıları
const msgs = [
  { direction: 'gelen', sender_type: 'lead', body: 'Merhaba, ürünler hakkında bilgi alabilir miyim?', created_at: '2026-11-21T09:00:00Z' },
  { direction: 'giden', sender_type: 'bot', body: 'Tabii, hangi ürünle ilgileniyorsunuz?', created_at: '2026-11-21T09:01:00Z' },
  { direction: 'giden', sender_type: 'sistem', body: 'devir', created_at: '2026-11-21T09:01:30Z' },
  { direction: 'gelen', sender_type: 'lead', body: null, content_type: 'image', created_at: '2026-11-21T09:05:00Z' }
];
const tr = m.transcript(msgs);
assert.ok(tr.startsWith('Kişi: Merhaba'));
assert.ok(tr.includes('Bot: Tabii'));
assert.ok(!tr.includes('devir'));
assert.ok(tr.endsWith('Kişi: [image]'));
assert.equal(m.transcript(msgs, 1), 'Kişi: [image]');
assert.equal(m.lastIncoming(msgs), '2026-11-21T09:05:00Z');
assert.equal(m.awaitingReply(msgs), true);
assert.equal(m.awaitingReply(msgs.slice(0, 3)), false);
assert.equal(m.lastIncoming([]), null);
const pr = [P(1, { last_message_at: '2026-11-20T10:00:00Z' }), P(2, { last_message_at: '2026-11-21T10:00:00Z' }), P(3, null)];
assert.deepEqual(m.recentWriters(pr).map(p => p.id), [2, 1]);
console.log('crm konuşma testleri geçti');
