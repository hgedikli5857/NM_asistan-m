// NM Departmanı — CRM köprüsü (Supabase Edge Function)
// crm-panel (WhatsApp bot CRM) verisini, kullanıcıya ait token ile salt-okunur çeker.
// Token private.crm_links tablosunda durur; tarayıcıya hiç gitmez.
//   { action: 'sync' }                      → adayları senkronla
//   { action: 'messages', prospect_id }     → o adayın WhatsApp mesaj geçmişi
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Link = { user_id: string; crm_url: string; crm_key: string; token: string };

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
