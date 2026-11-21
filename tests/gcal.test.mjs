// Google Takvim köprüsü: eşitleme planı ve Apps Script şablonu
import assert from 'node:assert/strict';
import { planSync, appsScript } from '../js/takvim/gcal.js';

const sign = it => JSON.stringify(it);
const a = { id: 'ap:1', title: 'Sunum' }, b = { id: 'tk:2026-11-22', title: 'Takip: 2 kişi' }, c = { id: 'gt:3', title: 'Görev' };
const existing = { 'ap:1': sign(a), 'tk:2026-11-22': sign({ ...b, title: 'Takip: 1 kişi' }), 'ic:eski': 'x' };
const p = planSync(existing, [a, b, c, a], sign);
assert.deepEqual(p.keep, ['ap:1']);
assert.deepEqual(p.update.map(x => x.id), ['tk:2026-11-22']);
assert.deepEqual(p.create.map(x => x.id), ['gt:3']);
assert.deepEqual(p.remove, ['ic:eski']);
assert.deepEqual(planSync({}, [], sign), { create: [], update: [], keep: [], remove: [] });

const code = appsScript('gc_test');
assert.ok(code.includes("NMD_TOKEN = 'gc_test'") && code.includes('everyMinutes(1)') && code.includes('onEventUpdated') && code.includes('function durdur()'));
new Function(code);
console.log('gcal: tamam');
