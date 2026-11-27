// NM Departmanı — Medya sunucusu: stok video/fotoğraf (Pexels) ve AI görsel (Gemini)
// Anahtarlar sunucuda gizli: PEXELS_API_KEY, GEMINI_API_KEY. Yalnızca giriş yapmış kullanıcılar.
//   { action: 'status' }                                  → hangi servisler hazır
//   { action: 'stok', q, kind: 'video'|'foto', page? }    → Pexels sonuçları (dikey)
//   { action: 'indir', url }                              → Pexels dosyasını aktar (CORS için)
//   { action: 'gorsel', prompt, oran: '9:16'|'4:5'|'1:1' } → Gemini görseli (base64)
import { createClient } from 'npm:@supabase/supabase-js@2';

const IMAGE_MODEL = 'gemini-3.1-flash-image';
const DAILY_LIMIT = 60;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type PexFile = { link: string; width: number; height: number; file_type: string; quality?: string };

// Dikey ve 1080 genişliği geçmeyen en iyi MP4
function bestFile(files: PexFile[]): PexFile | null {
  const mp4 = files.filter(f => f.file_type === 'video/mp4' && f.width && f.height);
  const portrait = mp4.filter(f => f.height >= f.width);
  const pool = (portrait.length ? portrait : mp4).filter(f => f.width <= 1080);
  const list = pool.length ? pool : mp4;
  return list.sort((a, b) => b.width - a.width)[0] || null;
}

const STYLE = 'Dikey sosyal medya görseli. Fotoğraf gerçekçiliğinde, doğal ışık, sıcak ve samimi atmosfer. ' +
  'Görselde hiçbir yazı, harf, logo, marka, filigran ya da ürün etiketi olmasın. Tanınmış kişi olmasın. ' +
  'Sağlıkla ilgili tedavi, önce/sonra ya da abartılı vaat çağrıştıran sahne olmasın. Konunun üst ve alt kısmında yazı için sade boşluk bırak.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const pexKey = Deno.env.get('PEXELS_API_KEY');
    const gemKey = Deno.env.get('GEMINI_API_KEY');
    const body = await req.json().catch(() => ({}));

    if (body.action === 'status') return json({ stok: !!pexKey, gorsel: !!gemKey });

    if (body.action === 'stok') {
      if (!pexKey) return json({ error: 'no_key', message: 'Sunucuda PEXELS_API_KEY tanımlı değil.' }, 503);
      const q = String(body.q || '').trim().slice(0, 100);
      if (q.length < 2) return json({ error: 'bad_request', message: 'Arama kelimesi yaz.' }, 400);
      const page = Math.min(Math.max(Number(body.page) || 1, 1), 20);
      const video = body.kind !== 'foto';
      const qs = new URLSearchParams({ query: q, orientation: 'portrait', per_page: '15', page: String(page), locale: 'tr-TR' });
      const r = await fetch(`https://api.pexels.com/${video ? 'videos/search' : 'v1/search'}?${qs}`, { headers: { Authorization: pexKey } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: 'upstream', message: data?.error || `Pexels HTTP ${r.status}` }, 502);
      const items = video
        ? (data.videos || []).map((v: { id: number; image: string; duration: number; url: string; user?: { name: string }; video_files: PexFile[] }) => {
            const f = bestFile(v.video_files || []);
            return f && { id: v.id, thumb: v.image, dur: v.duration, file: f.link, w: f.width, h: f.height, by: v.user?.name || '', page: v.url };
          }).filter(Boolean)
        : (data.photos || []).map((p: { id: number; url: string; photographer: string; width: number; height: number; alt?: string; src: Record<string, string> }) =>
            ({ id: p.id, thumb: p.src.medium, file: p.src.large2x || p.src.original, w: p.width, h: p.height, by: p.photographer, page: p.url, alt: p.alt || '' }));
      return json({ items, page, more: !!data.next_page });
    }

    if (body.action === 'indir') {
      const u = String(body.url || '');
      let host = '';
      try { host = new URL(u).hostname; } catch { /* geçersiz */ }
      if (!/^(videos|images)\.pexels\.com$/.test(host) && !/\.pexels\.com$/.test(host)) return json({ error: 'bad_url' }, 400);
      const r = await fetch(u);
      if (!r.ok || !r.body) return json({ error: 'upstream', message: `İndirilemedi (HTTP ${r.status})` }, 502);
      const len = Number(r.headers.get('content-length') || 0);
      if (len > 80 * 1048576) return json({ error: 'too_big', message: 'Dosya çok büyük; başka bir klip seç.' }, 413);
      return new Response(r.body, { headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', ...(len ? { 'Content-Length': String(len) } : {}) } });
    }

    if (body.action === 'gorsel') {
      if (!gemKey) return json({ error: 'no_key', message: 'Sunucuda GEMINI_API_KEY tanımlı değil.' }, 503);
      const prompt = String(body.prompt || '').trim().slice(0, 1500);
      if (prompt.length < 3) return json({ error: 'bad_request', message: 'Görseli birkaç kelimeyle anlat.' }, 400);
      const oran = ['9:16', '4:5', '1:1'].includes(body.oran) ? body.oran : '9:16';
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: remaining, error } = await admin.rpc('ai_consume', { p_user: user.id, p_limit: DAILY_LIMIT });
      if (error) return json({ error: 'usage_error' }, 500);
      if (remaining < 0) return json({ error: 'limit', message: `Bugünkü AI kullanım hakkın doldu (${DAILY_LIMIT}). Yarın yenilenir.` }, 429);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gemKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${STYLE}\n\nKonu: ${prompt}` }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: oran } }
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: 'upstream', message: data?.error?.message || `Gemini HTTP ${r.status}` }, 502);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data)?.inlineData;
      if (!img) {
        const why = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'bilinmiyor';
        return json({ error: 'empty', message: `Görsel üretilemedi (${why}). Anlatımı değiştirip tekrar dene.` }, 502);
      }
      return json({ b64: img.data, mime: img.mimeType || 'image/png', remaining });
    }

    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server', message: String((e as Error)?.message || e).slice(0, 400) }, 500);
  }
});
