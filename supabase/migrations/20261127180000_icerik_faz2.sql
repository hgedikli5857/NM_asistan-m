-- İçerik fabrikası Faz 2: Instagram'a Reels/Gönderi yayını, planlı otomatik yayın,
-- yorum anahtar kelimesi → herkese açık yanıtla WhatsApp linki + CRM'e aday.

-- 1) Yayın alanları
alter table public.content_posts add column if not exists auto_publish boolean not null default false;
alter table public.content_posts add column if not exists ig_media_id text;
alter table public.content_posts add column if not exists ig_creation_id text;
alter table public.content_posts add column if not exists ig_error text;
alter table public.content_posts drop constraint if exists content_posts_ig_error_len;
alter table public.content_posts add constraint content_posts_ig_error_len check (ig_error is null or length(ig_error) <= 500);

-- 2) Yorum otomasyonu ayarları (marka kiti)
alter table public.content_brand add column if not exists wa_phone text;
alter table public.content_brand add column if not exists comment_auto boolean not null default false;
alter table public.content_brand add column if not exists comment_reply text;
alter table public.content_brand drop constraint if exists content_brand_wa_phone_chk;
alter table public.content_brand add constraint content_brand_wa_phone_chk check (wa_phone is null or wa_phone ~ '^[0-9]{10,15}$');
alter table public.content_brand drop constraint if exists content_brand_comment_reply_len;
alter table public.content_brand add constraint content_brand_comment_reply_len check (comment_reply is null or length(comment_reply) <= 220);

-- 3) İşlenen yorumlar (aynı yoruma iki kez yanıt verilmesin)
create table if not exists public.ig_comment_log (
  comment_id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.content_posts(id) on delete set null,
  username text,
  text text,
  prospect_id uuid references public.prospects(id) on delete set null,
  replied boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ig_comment_log_owner_idx on public.ig_comment_log (owner_id, created_at desc);
alter table public.ig_comment_log enable row level security;
drop policy if exists ig_comment_log_read on public.ig_comment_log;
create policy ig_comment_log_read on public.ig_comment_log for select to authenticated
  using (owner_id = (select auth.uid()));

-- 4) Zamanlayıcı anahtarı (yalnızca veritabanı ve sunucu bilir)
create table if not exists private.cron_tokens (name text primary key, token text not null);
revoke all on private.cron_tokens from public, anon, authenticated;
insert into private.cron_tokens (name, token) values ('instagram', encode(gen_random_bytes(24), 'hex'))
  on conflict (name) do nothing;
create or replace function public.cron_token_ok(p_name text, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.cron_tokens where name = p_name and token = p_token)
$$;
revoke all on function public.cron_token_ok(text, text) from public, anon, authenticated;
grant execute on function public.cron_token_ok(text, text) to service_role;

-- 5) Saati gelmiş otomatik yayınlar (İstanbul saatiyle)
create or replace function public.ig_due_posts()
returns setof public.content_posts language sql stable security definer set search_path = '' as $$
  select p.* from public.content_posts p
  where p.auto_publish and p.status = 'hazir' and p.published_at is null and p.media is not null
    and p.format in ('reels', 'gonderi')
    and p.planned_for >= (now() at time zone 'Europe/Istanbul')::date - 2
    and (p.planned_for + coalesce(p.post_time, time '07:45')) <= (now() at time zone 'Europe/Istanbul')
  order by p.planned_for, p.post_time limit 10
$$;
revoke all on function public.ig_due_posts() from public, anon, authenticated;
grant execute on function public.ig_due_posts() to service_role;

-- 6) Her 5 dakikada bir sunucu fonksiyonunu çağır
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'instagram-otomatik';
select cron.schedule('instagram-otomatik', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dpiuyhwjvagezsuhgqxp.supabase.co/functions/v1/instagram-cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select token from private.cron_tokens where name = 'instagram')),
    body := '{}'::jsonb, timeout_milliseconds := 140000)
$cron$);
