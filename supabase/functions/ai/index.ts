// NM Departmanı — AI ara sunucusu (Supabase Edge Function)
// Claude API anahtarı sunucuda gizli (ANTHROPIC_API_KEY) tutulur; tarayıcıya hiç gitmez.
// Yalnızca giriş yapmış kullanıcılar, kişi başı günlük limitle kullanabilir.
import { createClient } from 'npm:@supabase/supabase-js@2';

const DAILY_LIMIT = 60;
const MODEL = 'claude-haiku-5-5';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    // 1) Önce kimlik: yalnızca giriş yapmış kullanıcı
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    // 2) Sonra anahtar
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'no_server_key' }, 503);

    const body = await req.json().catch(() => ({}));
    const system = typeof body.system === 'string' ? body.system.slice(0, 12000) : undefined;
    const messages = Array.isArray(body.messages)
      ? body.messages.slice(-30).map((m: { role?: string; content?: unknown }) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content ?? '').slice(0, 12000)
        }))
      : [];
    if (!messages.length || messages[0].role !== 'user') return json({ error: 'bad_request' }, 400);
    const max_tokens = Math.min(Math.max(Number(body.max_tokens) || 400, 50), 1500);

    const admin = createClient(url, service);
    const { data: remaining, error } = await admin.rpc('ai_consume', { p_user: user.id, p_limit: DAILY_LIMIT });
    if (error) return json({ error: 'usage_error' }, 500);
    if (remaining < 0) return json({ error: 'limit', limit: DAILY_LIMIT }, 429);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens, ...(system ? { system } : {}), messages })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: 'upstream', message: data?.error?.message || `HTTP ${r.status}` }, 502);
    const text = (data.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim();
    return json({ text, remaining, limit: DAILY_LIMIT });
  } catch (e) {
    return json({ error: 'server', message: String(e) }, 500);
  }
});
