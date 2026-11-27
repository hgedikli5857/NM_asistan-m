// NM Departmanı — Instagram zamanlayıcısı (pg_cron her 5 dakikada çağırır)
// 1) Saati gelen otomatik yayınları yapar  2) Yorum anahtar kelimesine WhatsApp linkiyle yanıt verir, yorumu yapanı CRM'e aday ekler.
// Not: yardımcılar instagram/index.ts'ten kopyalanmıştır; orada değişirse burada da güncelle.
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

const DEFAULT_REPLY = 'Merhaba @{kullanici}, ilgin için teşekkürler! Detayları WhatsApp\'tan konuşalım: {link}';
const MAX_REPLIES = 15;
const lowerTr = (x: string) => x.toLocaleLowerCase('tr-TR');
function listOf(res: unknown): Record<string, any>[] {
  const r = res as Record<string, any>;
  for (const c of [r?.data, r?.data?.data, r?.response_data?.data, r]) if (Array.isArray(c)) return c;
  return [];
}
function waLink(phone: string, kw: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Merhaba, Instagram'dan yazıyorum (${kw})`)}`;
}
export function replyText(tpl: string | null, username: string, link: string) {
  let t = (tpl || DEFAULT_REPLY).trim();
  if (!t.includes('{link}')) t += ' {link}';
  t = t.replaceAll('{kullanici}', username).replace('{link}', link).replaceAll('{link}', '');
  return t.slice(0, 300);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: ok } = await admin.rpc('cron_token_ok', { p_name: 'instagram', p_token: req.headers.get('x-cron-token') || '' });
  if (!ok) return json({ error: 'unauthorized' }, 401);
  const key = Deno.env.get('COMPOSIO_API_KEY');
  if (!key) return json({ error: 'no_key' }, 503);

  const report = { published: 0, pending: 0, failed: 0, replies: 0, leads: 0, errors: [] as string[] };
  const cache = new Map<string, Found | null>();
  async function accountOf(owner: string): Promise<Found | null> {
    if (cache.has(owner)) return cache.get(owner)!;
    const { data: link } = await admin.rpc('ig_link_get', { p_user: owner });
    let f: Found | null = null;
    if (link) {
      try { f = await resolve(key!, link, { accounts: 0, tried: [], errors: [] }); }
      catch (e) { report.errors.push('hesap: ' + String((e as Error).message).slice(0, 120)); }
      if (f && (f.acc.id !== link.composio_account_id || f.igUser !== link.ig_user_id)) await admin.rpc('ig_link_cache', { p_user: owner, p_account: f.acc.id, p_ig_user: f.igUser });
    }
    cache.set(owner, f);
    return f;
  }

  // A) Saati gelen otomatik yayınlar
  const { data: due } = await admin.rpc('ig_due_posts');
  for (const post of (due || []) as Record<string, any>[]) {
    const f = await accountOf(post.owner_id);
    if (!f) { await admin.from('content_posts').update({ auto_publish: false, ig_error: 'Instagram hesabı bulunamadı; otomatik yayın durduruldu.' }).eq('id', post.id); report.failed++; continue; }
    const caption = captionOf(post).slice(0, 2200);
    try {
      if (BANNED.test(caption)) throw new Error('Açıklamada marka filtresine takılan terim var.');
      const res = await publishPost(key, f, post, caption, post.ig_creation_id || null, url);
      if (res.pending) { await admin.from('content_posts').update({ ig_creation_id: res.creation_id, ig_error: null }).eq('id', post.id); report.pending++; }
      else {
        await admin.from('content_posts').update({ status: 'paylasildi', ig_permalink: res.permalink, ig_media_id: res.media_id, ig_creation_id: null, ig_error: null, published_at: new Date().toISOString() }).eq('id', post.id);
        report.published++;
      }
    } catch (e) {
      await admin.from('content_posts').update({ auto_publish: false, ig_creation_id: null, ig_error: ('Otomatik yayın başarısız: ' + String((e as Error).message || e)).slice(0, 500) }).eq('id', post.id);
      report.failed++;
    }
  }

  // B) Yorum anahtar kelimesi → herkese açık yanıt (WhatsApp linki) + CRM'e aday
  const { data: brands } = await admin.from('content_brand').select('*').eq('comment_auto', true).not('kw', 'is', null).not('wa_phone', 'is', null);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  for (const b of (brands || []) as Record<string, any>[]) {
    if (report.replies >= MAX_REPLIES) break;
    const f = await accountOf(b.owner_id);
    if (!f) continue;
    const kw = lowerTr(String(b.kw).trim());
    const { data: posts } = await admin.from('content_posts').select('id, org_id, topic, ig_media_id').eq('owner_id', b.owner_id)
      .not('ig_media_id', 'is', null).gte('published_at', since).order('published_at', { ascending: false }).limit(10);
    for (const post of (posts || []) as Record<string, any>[]) {
      if (report.replies >= MAX_REPLIES) break;
      let comments: Record<string, any>[] = [];
      try { comments = listOf(await exec(key, f.acc, 'INSTAGRAM_GET_IG_MEDIA_COMMENTS', { ig_media_id: post.ig_media_id, limit: 50, fields: 'id,text,username,timestamp,parent_id' })); }
      catch (e) { report.errors.push('yorum: ' + String((e as Error).message).slice(0, 120)); continue; }
      const cand = comments.filter(c => c.id && !c.parent_id && c.username && lowerTr(String(c.username)) !== lowerTr(f.username)
        && lowerTr(String(c.text || '')).includes(kw));
      if (!cand.length) continue;
      const { data: seen } = await admin.from('ig_comment_log').select('comment_id').in('comment_id', cand.map(c => String(c.id)));
      const done = new Set((seen || []).map((x: { comment_id: string }) => x.comment_id));
      for (const c of cand) {
        if (report.replies >= MAX_REPLIES) break;
        const cid = String(c.id);
        if (done.has(cid)) continue;
        const username = String(c.username).replace(/^@/, '');
        const { error: claim } = await admin.from('ig_comment_log').insert({ comment_id: cid, org_id: post.org_id, owner_id: b.owner_id, post_id: post.id, username, text: String(c.text || '').slice(0, 500) });
        if (claim) continue; // başka bir çalıştırma aldı
        // Aday: aynı Instagram kullanıcısı zaten varsa yenisini açma
        let prospectId: string | null = null;
        const { data: ex } = await admin.from('prospects').select('id').eq('org_id', post.org_id).ilike('instagram', username).is('deleted_at', null).limit(1);
        if (ex && ex.length) prospectId = ex[0].id;
        else {
          const { data: np, error: pe } = await admin.from('prospects').insert({ org_id: post.org_id, owner_id: b.owner_id, full_name: '@' + username, instagram: username,
            channel: 'Instagram', source: 'Sosyal medya', tags: ['instagram-yorum'], next_follow_up_at: new Date().toISOString(),
            notes: `Instagram yorumu ("${String(post.topic || '').slice(0, 80)}"): ${String(c.text || '').slice(0, 300)}` }).select('id').single();
          if (pe) report.errors.push('aday: ' + pe.message.slice(0, 120)); else { prospectId = np.id; report.leads++; }
        }
        let replied = false, err: string | null = null;
        try {
          await exec(key, f.acc, 'INSTAGRAM_POST_IG_COMMENT_REPLIES', { ig_comment_id: cid, message: replyText(b.comment_reply, username, waLink(b.wa_phone, b.kw)) });
          replied = true; report.replies++;
        } catch (e) { err = String((e as Error).message || e).slice(0, 300); report.errors.push('yanıt: ' + err.slice(0, 120)); }
        await admin.from('ig_comment_log').update({ prospect_id: prospectId, replied, error: err }).eq('comment_id', cid);
      }
    }
  }
  if (report.published || report.failed || report.replies || report.errors.length) console.log('instagram-cron', JSON.stringify(report));
  return json(report);
});
