-- Instagram'a doğrudan yayın (Composio üzerinden)
-- 1) Geçici görsel alanı: Instagram görseli bağlantıdan alır. Dosyalar yayından hemen sonra silinir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ig-temp', 'ig-temp', true, 8388608, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg'];

-- Kullanıcı yalnızca kendi klasörüne (<user_id>/...) yükleyip silebilir
drop policy if exists "ig_temp_insert_own" on storage.objects;
create policy "ig_temp_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ig-temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "ig_temp_delete_own" on storage.objects;
create policy "ig_temp_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'ig-temp' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2) Yayın izni: yalnızca burada kaydı olan kullanıcı Instagram'a yayınlayabilir
create table if not exists private.ig_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ig_username text not null,
  composio_account_id text,
  ig_user_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
revoke all on private.ig_links from public, anon, authenticated;

create or replace function public.ig_link_get(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(l) from private.ig_links l where l.user_id = p_user and l.enabled
$$;
create or replace function public.ig_link_cache(p_user uuid, p_account text, p_ig_user text)
returns void language sql security definer set search_path = '' as $$
  update private.ig_links set composio_account_id = p_account, ig_user_id = p_ig_user where user_id = p_user
$$;
revoke all on function public.ig_link_get(uuid) from public, anon, authenticated;
revoke all on function public.ig_link_cache(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ig_link_get(uuid) to service_role;
grant execute on function public.ig_link_cache(uuid, text, text) to service_role;

-- 3) Yayınlanan gönderinin izi
alter table public.content_posts add column if not exists ig_permalink text;
alter table public.content_posts add column if not exists published_at timestamptz;

-- Silme için okuma izni de gerekir (yalnızca kendi klasörü)
drop policy if exists "ig_temp_select_own" on storage.objects;
create policy "ig_temp_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'ig-temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
