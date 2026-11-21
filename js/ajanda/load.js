// Ajanda verisini tüm kaynaklardan toplar. Bir kaynak hata verirse diğerleri yine gösterilir.
import { supabase, fetchAll } from '../supabase.js';
import { crmStatus, crmEvents } from '../crm/client.js';
import { buildAgenda, dayKey } from './model.js';

let crmCache = { at: 0, events: [], linked: null };

export async function loadAgenda(ctx, { days = 14, now = new Date() } = {}) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + days);
  const today = dayKey(now), lastDay = dayKey(new Date(end.getTime() - 1));
  const uid = ctx.user.id;
  const warn = [];
  const safe = async (name, p) => { try { const r = await p; if (r?.error) throw r.error; return r?.data ?? r; } catch { warn.push(name); return []; } };

  const crm = (async () => {
    if (Date.now() - crmCache.at < 10 * 60e3) return crmCache;
    const st = await crmStatus();
    if (!st.linked) { crmCache = { at: Date.now(), events: [], linked: false }; return crmCache; }
    const events = await crmEvents(Math.max(days, 14));
    crmCache = { at: Date.now(), events, linked: true };
    return crmCache;
  })().catch(() => { warn.push('Bot CRM etkinlikleri'); return { events: [], linked: null }; });

  const [appts, gEvents, prospects, tasks, posts, gcal, crmR] = await Promise.all([
    safe('Randevular', supabase.from('appointments')
      .select('id, title, kind, starts_at, duration_min, location, status, is_team_event, owner_id, org_id, prospects(full_name)')
      .gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at').limit(300)),
    safe('Google Takvim', supabase.from('calendar_events').select('ext_id, title, starts_at, ends_at, all_day, location, description')
      .eq('owner_id', uid).lt('starts_at', end.toISOString()).gte('ends_at', start.toISOString()).order('starts_at').limit(500)),
    safe('Takipler', fetchAll(() => supabase.from('prospects').select('id, full_name, next_follow_up_at')
      .eq('owner_id', uid).is('deleted_at', null).not('next_follow_up_at', 'is', null)
      .gte('next_follow_up_at', new Date(start.getTime() - 30 * 864e5).toISOString()).lt('next_follow_up_at', end.toISOString())
      .not('stage', 'in', '(pasif,is_ortagi)'), { max: 5000 })),
    safe('Görevler', supabase.from('tasks').select('id, title, due_date, done_at, prospects(full_name)')
      .eq('owner_id', uid).is('done_at', null).lte('due_date', lastDay).gte('due_date', dayKey(new Date(start.getTime() - 30 * 864e5))).limit(300)),
    safe('İçerik planı', supabase.from('content_posts').select('id, topic, format, status, planned_for, published_at')
      .eq('owner_id', uid).gte('planned_for', today).lte('planned_for', lastDay).limit(200)),
    supabase.rpc('gcal_status').then(r => r.data || {}, () => ({})),
    crm
  ]);

  const items = buildAgenda({
    appts: (appts || []).filter(a => a.owner_id === uid || (a.is_team_event && a.org_id === ctx.org?.id))
      .map(a => ({ ...a, prospect_name: a.prospects?.full_name })),
    gEvents, crmEvents: crmR.events, prospects,
    tasks: (tasks || []).map(t => ({ ...t, prospect_name: t.prospects?.full_name })),
    posts
  }, { now, days });

  return { items, warn, sources: { google: !!gcal.linked, googleAt: gcal.last_at || null, crm: crmR.linked } };
}
