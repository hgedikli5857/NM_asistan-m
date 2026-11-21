// NM Departmanı — CRM köprüsü (Supabase Edge Function)
// crm-panel (WhatsApp bot CRM) verisini, kullanıcıya ait token ile salt-okunur çeker.
// Token private.crm_links tablosunda durur; tarayıcıya hiç gitmez.
//   { action: 'sync' }                      → adayları senkronla
//   { action: 'messages', prospect_id }     → o adayın WhatsApp mesaj geçmişi
//   { action: 'events', days }              → Ajanda için aktif etkinlikler
//   { action: 'card', prospect_id }         → kişi kartı (bot CRM'den canlı)
//   { action: 'card_save', prospect_id, fields } → kartı bot CRM'e ve uygulamaya yaz
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Link = { user_id: string; crm_url: string; crm_key: string; token: string };
const STAGE_TO_ASAMA: Record<string, string> = {
  liste: 'temas_yok', temas: 'ilk_temas', davet: 'gorusme_planlandi', sunum: 'gorusme_yapildi', takip: 'gorusme_yapildi',
  musteri: 'musteri', is_ortagi: 'ekip_arkadasi', pasif: 'ilgilenmiyor'
};

async function crmRpc(link: Link, fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${link.crm_url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: link.crm_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: link.token, ...args })
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `CRM HTTP ${r.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(url, service);
    const { data: link } = await admin.rpc('crm_link_get', { p_user: user.id });
    if (!link) return json({ error: 'not_linked' }, 404);

    const body = await req.json().catch(() => ({}));
    if (body.action === 'sync') {
      const payload = await crmRpc(link as Link, 'nmd_export', {});
      const { data, error } = await admin.rpc('crm_apply_sync', { p_user: user.id, p_payload: payload });
      if (error) return json({ error: 'sync_failed', message: error.message }, 500);
      return json({ ok: true, result: data });
    }

    // İletişim Masası: önce senkron (yeni yazanlar aday olsun), sonra günlük rapor + öncelik verisi
    if (body.action === 'desk') {
      let sync = null;
      try {
        const payload = await crmRpc(link as Link, 'nmd_export', {});
        const r = await admin.rpc('crm_apply_sync', { p_user: user.id, p_payload: payload });
        sync = r.data;
      } catch { /* senkron olmazsa masa yine açılır */ }
      const desk = await crmRpc(link as Link, 'nmd_desk', {});
      const ids = new Set<string>();
      for (const c of desk.convs || []) ids.add(c.lead_id);
      for (const e of desk.etkinlikler || []) for (const k of e.katilimcilar || []) ids.add(k.lead_id);
      for (const o of desk.outbox || []) ids.add(o.lead_id);
      const map: Record<string, string> = {};
      const list = [...ids];
      for (let i = 0; i < list.length; i += 150) {
        const { data } = await admin.from('prospects').select('id, extra')
          .eq('owner_id', user.id).is('deleted_at', null)
          .in('extra->crm->>id', list.slice(i, i + 150));
        for (const p of data || []) map[p.extra?.crm?.id] = p.id;
      }
      const pid = (l: string) => map[l] || null;
      desk.convs = (desk.convs || []).map((c: Record<string, unknown>) => ({ ...c, prospect_id: pid(c.lead_id as string) }))
        .filter((c: Record<string, unknown>) => c.prospect_id); // eşleşmeyen korunan (kişisel) kişiler gösterilmez
      desk.etkinlikler = (desk.etkinlikler || []).map((e: Record<string, unknown>) => ({
        ...e, katilimcilar: ((e.katilimcilar as Record<string, unknown>[]) || []).map(k => ({ ...k, prospect_id: pid(k.lead_id as string) }))
      }));
      desk.outbox = (desk.outbox || []).map((o: Record<string, unknown>) => ({ ...o, prospect_id: pid(o.lead_id as string) }));
      return json({ desk, sync });
    }

    if (body.action === 'outbox' || body.action === 'qr_add') {
      if (body.action === 'qr_add') {
        const r = await crmRpc(link as Link, 'nmd_quick_reply_add', { p_title: String(body.title || ''), p_body: String(body.body || '') });
        return json({ ok: true, item: r });
      }
      const pid = String(body.prospect_id || '');
      const { data: p } = await userClient.from('prospects').select('id, owner_id, extra').eq('id', pid).maybeSingle();
      if (!p || p.owner_id !== user.id) return json({ error: 'not_found' }, 404);
      const crmId = p.extra?.crm?.id;
      if (!crmId) return json({ error: 'no_crm', message: 'Bu kişinin WhatsApp bot kaydı yok; telefondan gönder.' }, 400);
      try {
        const r = await crmRpc(link as Link, 'nmd_outbox_add', { p_lead_id: crmId, p_mesaj: String(body.mesaj || '') });
        return json({ ok: true, item: r });
      } catch (e) {
        return json({ error: 'outbox', message: String((e as Error).message || e).replace(/^giden_kutusu:\s*/, '') }, 400);
      }
    }

    // Ajanda: bot CRM'deki aktif etkinlikler (salt-okunur, hafif)
    if (body.action === 'events') {
      const days = Math.min(Math.max(Number(body.days) || 60, 1), 120);
      const events = await crmRpc(link as Link, 'nmd_etkinlikler', { p_days: days });
      return json({ events });
    }

    // Kişi kartı: bot CRM panelinin doldurduğu alanlar, iki yönlü
    if (body.action === 'card' || body.action === 'card_save') {
      const pid = String(body.prospect_id || '');
      const { data: p } = await userClient.from('prospects').select('id, owner_id, extra, stage').eq('id', pid).maybeSingle();
      if (!p || p.owner_id !== user.id) return json({ error: 'not_found' }, 404);
      const crmId = p.extra?.crm?.id;
      if (!crmId || p.extra?.crm?.protected) return json({ linked: false });
      let card;
      try {
        if (body.action === 'card') card = await crmRpc(link as Link, 'nmd_lead_card', { p_lead_id: crmId });
        else {
          const f = { ...(body.fields || {}) } as Record<string, unknown>;
          if (f.stage) { const a = STAGE_TO_ASAMA[String(f.stage)]; if (a) f.asama = a; delete f.stage; }
          card = await crmRpc(link as Link, 'nmd_lead_update', { p_lead_id: crmId, p_fields: f });
        }
      } catch (e) {
        return json({ error: 'crm', message: String((e as Error).message || e) }, 400);
      }
      const kart = { ...card }; delete kart.id; delete kart.phone; delete kart.tags;
      const upd: Record<string, unknown> = { extra: { ...(p.extra || {}), crm: { ...(p.extra?.crm || {}), kart, tags: card.tags, synced_at: new Date().toISOString() } } };
      if (body.action === 'card_save') {
        const f = body.fields || {};
        if ('meslek' in f) upd.occupation = card.meslek || null;
        if ('ilgi_alanlari' in f) upd.interests = card.ilgi_alanlari || null;
        if ('instagram' in f) upd.instagram = card.instagram || null;
        if ('ad_soyad' in f && card.ad_soyad) upd.full_name = card.ad_soyad;
        if ('liste_turu' in f && ['sicak', 'ilik', 'soguk'].includes(card.liste_turu)) upd.temperature = card.liste_turu;
        if (f.stage) upd.stage = f.stage;
      }
      await admin.from('prospects').update(upd).eq('id', pid);
      return json({ linked: true, card });
    }

    if (body.action === 'messages') {
      const pid = String(body.prospect_id || '');
      // Aday gerçekten bu kullanıcının mı? (kullanıcı oturumuyla, RLS üzerinden)
      const { data: p } = await userClient.from('prospects')
        .select('id, owner_id, extra').eq('id', pid).maybeSingle();
      if (!p || p.owner_id !== user.id) return json({ error: 'not_found' }, 404);
      const crmId = p.extra?.crm?.id;
      if (!crmId) return json({ messages: [] });
      const messages = await crmRpc(link as Link, 'nmd_messages', {
        p_lead_id: crmId, p_limit: Math.min(Math.max(Number(body.limit) || 60, 1), 200)
      });
      return json({ messages });
    }
    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server', message: String((e as Error)?.message || e) }, 500);
  }
});
