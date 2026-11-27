// NM Departmanı — Instagram'a doğrudan yayın (Composio üzerinden)
// COMPOSIO_API_KEY sunucuda gizli; tarayıcıya hiç gitmez. Yalnızca private.ig_links'te izni olan kullanıcı yayınlar.
//   { action: 'status' }                                   → hazır mı, hangi hesap
//   { action: 'publish', paths: [...], caption, post_id? } → karusel oluştur + yayınla, geçici görselleri sil
//   { action: 'publish_media', post_id, caption }          → takvimdeki Reels/Gönderi'yi yayınla
//                                                             (video işlenirken { pending, creation_id } döner)
//   { action: 'publish_finish', post_id, creation_id }     → işlenen Reels'i yayınla
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://backend.composio.dev';
const BUCKET = 'ig-temp';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const BANNED = /(network\s*marketing|\bmlm\b|çok\s*katmanl|ponzi)/i;

type Acc = { id: string; user_id?: string };

// İç içe yanıtta ilk uygun alanı bul (Composio araç çıktıları farklı derinlikte olabilir)
function findKey(o: unknown, keys: string[], depth = 0): string | null {
  if (!o || typeof o !== 'object' || depth > 5) return null;
  const r = o as Record<string, unknown>;
  for (const k of keys) if (typeof r[k] === 'string' || typeof r[k] === 'number') return String(r[k]);
  for (const v of Object.values(r)) { const f = findKey(v, keys, depth + 1); if (f) return f; }
  return null;
}

async function composio(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message || data?.message || data?.error || `Composio HTTP ${r.status}`);
  return data;
}
async function exec(key: string, acc: Acc, slug: string, args: Record<string, unknown>) {
  const res = await composio(key, `/api/v3.1/tools/execute/${slug}`, {
    method: 'POST', body: JSON.stringify({ connected_account_id: acc.id, ...(acc.user_id ? { user_id: acc.user_id } : {}), arguments: args })
  });
  if (res?.successful === false) throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error || res.data || 'Composio hatası').slice(0, 300));
  return res?.data ?? res;
}

// Bağlı Instagram hesabını bul (önce önbellek, sonra Composio'daki aktif hesaplar)
type Diag = { accounts: number; tried: string[]; errors: string[] };
async function resolve(key: string, link: Record<string, string>, diag: Diag): Promise<{ acc: Acc; igUser: string; username: string } | null> {
  const list = await composio(key, '/api/v3/connected_accounts?toolkit_slugs=instagram&statuses=ACTIVE&limit=50');
  const items: Record<string, unknown>[] = (list?.items || list?.data || []).filter((a: Record<string, unknown>) =>
    String((a.status as string) || 'ACTIVE').toUpperCase() === 'ACTIVE');
  const accs: Acc[] = items.map(a => ({ id: String(a.id), user_id: (a.user_id as string) || (a.entity_id as string) || undefined }));
  diag.accounts = accs.length;
  const ordered = [...accs.filter(a => a.id === link.composio_account_id), ...accs.filter(a => a.id !== link.composio_account_id)];
  for (const acc of ordered) {
    try {
      const info = await exec(key, acc, 'INSTAGRAM_GET_USER_INFO', { ig_user_id: 'me', fields: 'id,username' });
      const username = findKey(info, ['username']) || '';
      const igUser = findKey(info, ['id', 'user_id']) || '';
      diag.tried.push(username ? '@' + username : acc.id);
      if (igUser && (!link.ig_username || username.toLowerCase() === link.ig_username.toLowerCase())) return { acc, igUser, username };
    } catch (e) { diag.errors.push(String((e as Error).message || e).slice(0, 200)); console.error('instagram resolve', acc.id, e); }
  }
  return null;
}

type Found = { acc: Acc; igUser: string; username: string };
function captionOf(p: { caption?: string | null; hashtags?: string | null }) {
  return [String(p.caption || '').trim(), String(p.hashtags || '').trim()].filter(Boolean).join('\n\n');
}
const pubUrlOf = (base: string, path: string) => `${base}/storage/v1/object/public/icerik/${path.split('/').map(encodeURIComponent).join('/')}`;
const notReady = (m: string) => /9007|not\s*ready|IN_PROGRESS|still processing|henüz/i.test(m);

// Reels/Gönderi yayını: görsel hemen, video işlenirken "pending" döner
async function publishPost(key: string, f: Found, post: Record<string, any>, caption: string, creationId: string | null, base: string) {
  const media = post.media || {};
  if (!media.path) throw new Error('Önce videoyu ya da görseli kaydet (takvime yüklenmiş dosya yok).');
  const isVideo = post.format === 'reels';
  if (isVideo && !/\.mp4$/i.test(media.path) && media.type !== 'video/mp4') throw new Error('Instagram Reels için MP4 gerekir; bu dosya ' + (media.type || 'farklı biçimde') + '.');
  if (!isVideo && !/\.(jpe?g)$/i.test(media.path)) throw new Error('Instagram gönderisi için JPEG gerekir.');
  let cid = creationId;
  if (!cid) {
    const args: Record<string, unknown> = { ig_user_id: f.igUser, caption };
    if (isVideo) Object.assign(args, { video_url: pubUrlOf(base, media.path), media_type: 'REELS', share_to_feed: true });
    else args.image_url = pubUrlOf(base, media.path);
    const c = await exec(key, f.acc, 'INSTAGRAM_POST_IG_USER_MEDIA', args);
    cid = findKey(c, ['id', 'creation_id', 'container_id']);
    if (!cid) throw new Error('Instagram taslağı oluşturulamadı.');
  }
  let pub;
  try { pub = await exec(key, f.acc, 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', { ig_user_id: f.igUser, creation_id: cid, max_wait_seconds: isVideo ? 45 : 30 }); }
  catch (e) {
    const m = String((e as Error).message || e);
    if (isVideo && notReady(m)) return { pending: true, creation_id: cid };
    throw e;
  }
  const mediaId = findKey(pub, ['id', 'ig_media_id', 'media_id']);
  if (!mediaId && isVideo) return { pending: true, creation_id: cid };
  let permalink: string | null = null;
  if (mediaId) {
    try { permalink = findKey(await exec(key, f.acc, 'INSTAGRAM_GET_IG_MEDIA', { ig_media_id: mediaId, fields: 'id,permalink' }), ['permalink']); }
    catch { /* yayın yine başarılı */ }
  }
  return { pending: false, media_id: mediaId, permalink };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let cleanup: string[] = [];
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { data: link } = await admin.rpc('ig_link_get', { p_user: user.id });
    if (!link) return json({ error: 'not_allowed', message: 'Bu hesap için Instagram yayını açık değil.' }, 403);
    const key = Deno.env.get('COMPOSIO_API_KEY');
    if (!key) return json({ error: 'no_key', message: 'Sunucuda COMPOSIO_API_KEY tanımlı değil.' }, 503);

    const body = await req.json().catch(() => ({}));
    const diag: Diag = { accounts: 0, tried: [], errors: [] };
    let found = null;
    try { found = await resolve(key, link, diag); }
    catch (e) { console.error('instagram list', e); return json({ error: 'composio', message: 'Composio hesap listesi alınamadı: ' + String((e as Error).message || e).slice(0, 200) }, 502); }
    if (!found) {
      console.error('instagram no_account', JSON.stringify(diag));
      const why = !diag.accounts ? `Bu API anahtarının projesinde aktif Instagram bağlantısı yok (0 hesap). Anahtarı Instagram'ın bağlı olduğu projeden al ya da Instagram'ı bu projede bağla.`
        : diag.errors.length ? `${diag.accounts} hesap bulundu ama sorgulanamadı: ${diag.errors[0]}`
        : `${diag.accounts} hesap bulundu (${diag.tried.join(', ')}), @${link.ig_username} değil.`;
      return json({ error: 'no_account', message: why, diag }, 404);
    }
    if (found.acc.id !== link.composio_account_id || found.igUser !== link.ig_user_id) {
      await admin.rpc('ig_link_cache', { p_user: user.id, p_account: found.acc.id, p_ig_user: found.igUser });
    }

    if (body.action === 'status') return json({ ready: true, username: found.username || link.ig_username });

    if (body.action === 'publish') {
      const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
      cleanup = paths.filter(p => p.startsWith(user.id + '/'));
      if (cleanup.length !== paths.length) return json({ error: 'bad_paths' }, 400);
      if (paths.length < 2 || paths.length > 10) return json({ error: 'count', message: 'Karusel 2-10 görsel olmalı.' }, 400);
      const caption = String(body.caption || '').slice(0, 2200);
      if (BANNED.test(caption)) return json({ error: 'brand', message: 'Açıklama metninde yasak terim var (marka filtresi).' }, 400);
      const urls = paths.map(p => `${url}/storage/v1/object/public/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`);

      const container = await exec(key, found.acc, 'INSTAGRAM_CREATE_CAROUSEL_CONTAINER', { ig_user_id: found.igUser, caption, child_image_urls: urls });
      const creationId = findKey(container, ['id', 'creation_id', 'container_id']);
      if (!creationId) throw new Error('Karusel taslağı oluşturulamadı.');
      const pub = await exec(key, found.acc, 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', { ig_user_id: found.igUser, creation_id: creationId, max_wait_seconds: 90 });
      const mediaId = findKey(pub, ['id', 'ig_media_id', 'media_id']);
      let permalink: string | null = null;
      if (mediaId) {
        try { permalink = findKey(await exec(key, found.acc, 'INSTAGRAM_GET_IG_MEDIA', { ig_media_id: mediaId, fields: 'id,permalink' }), ['permalink']); }
        catch { /* bağlantı alınamazsa yayın yine başarılı */ }
      }
      if (body.post_id) {
        await userClient.from('content_posts').update({ status: 'paylasildi', ig_permalink: permalink, ig_media_id: mediaId, published_at: new Date().toISOString() }).eq('id', String(body.post_id));
      }
      return json({ ok: true, media_id: mediaId, permalink });
    }

    if (body.action === 'publish_media' || body.action === 'publish_finish') {
      const { data: post, error: pe } = await userClient.from('content_posts').select('*').eq('id', String(body.post_id || '')).maybeSingle();
      if (pe || !post) return json({ error: 'not_found', message: 'Takvim kaydı bulunamadı.' }, 404);
      if (post.published_at) return json({ ok: true, permalink: post.ig_permalink, already: true });
      if (!['reels', 'gonderi'].includes(post.format)) return json({ error: 'format', message: 'Bu yol yalnızca Reels ve Gönderi içindir.' }, 400);
      const caption = String(body.caption ?? captionOf(post)).slice(0, 2200);
      if (BANNED.test(caption)) return json({ error: 'brand', message: 'Açıklama metninde yasak terim var (marka filtresi).' }, 400);
      const res = await publishPost(key, found, post, caption, body.action === 'publish_finish' ? String(body.creation_id || '') : null, url);
      const patch = res.pending ? { ig_creation_id: res.creation_id, ig_error: null }
        : { status: 'paylasildi', ig_permalink: res.permalink, ig_media_id: res.media_id, ig_creation_id: null, ig_error: null, published_at: new Date().toISOString() };
      await userClient.from('content_posts').update(patch).eq('id', post.id);
      return json({ ok: !res.pending, ...res });
    }
    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server', message: String((e as Error)?.message || e).slice(0, 400) }, 500);
  } finally {
    if (cleanup.length) await admin.storage.from(BUCKET).remove(cleanup).catch(() => {});
  }
});
