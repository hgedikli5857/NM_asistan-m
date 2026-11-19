import assert from 'node:assert/strict';
import { buildTree } from '../js/ekip/tree.js';
import { IDEAS } from '../js/pazarlama/content.js';
import { checkMessage } from '../js/iletisim/uyum.js';
import { SCENARIOS, apiMessages, feedbackPrompt } from '../js/iletisim/pratik.js';
const t = buildTree([
  { user_id: 'o', role: 'owner', sponsor_user_id: null },
  { user_id: 'a', role: 'member', sponsor_user_id: 'o' },
  { user_id: 'b', role: 'member', sponsor_user_id: 'a' },
  { user_id: 'x', role: 'member', sponsor_user_id: 'y' }, { user_id: 'y', role: 'member', sponsor_user_id: 'x' }, // döngü
  { user_id: 'z', role: 'member', sponsor_user_id: 'disarida' }
]);
assert.equal(t[0].user_id, 'o'); assert.equal(t[0].children[0].children[0].user_id, 'b');
const count = n => 1 + n.children.reduce((s, c) => s + count(c), 0);
assert.equal(t.reduce((s, r) => s + count(r), 0), 6, 'herkes ağaçta bir kez');
const bad = IDEAS.filter(i => checkMessage(i.caption).length).map(i => i.topic);
assert.deepEqual(bad, [], 'fikir bankası uyumlu olmalı');
const msgs = apiMessages(SCENARIOS[0], [{ role: 'user', content: 'Merhaba' }]);
assert.equal(msgs[0].role, 'user'); assert.equal(msgs[1].role, 'assistant');
assert.ok(feedbackPrompt(SCENARIOS[0], msgs).includes('✅'));
console.log('faz 2-4 testleri geçti');
