-- Faz 3: içerik takvimi + web sitesi aday formu

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  planned_for date not null,
  platform text not null default 'Instagram' check (platform in ('Instagram','Facebook','TikTok','YouTube','LinkedIn','WhatsApp durum')),
  format text not null default 'gonderi' check (format in ('gonderi','reels','story','canli','video')),
  pillar text check (pillar in ('yasam','ogretici','deneyim','etkilesim','ekip')),
  topic text not null check (length(topic) <= 200),
  caption text check (length(caption) <= 2200),
  status text not null default 'fikir' check (status in ('fikir','taslak','hazir','paylasildi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_posts_owner_idx on public.content_posts(owner_id, planned_for);
create index content_posts_org_idx on public.content_posts(org_id);
create trigger content_posts_updated before update on public.content_posts for each row execute function public.set_updated_at();
alter table public.content_posts enable row level security;
create policy "içerik: sahibi" on public.content_posts for all to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id));

create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null unique default encode(extensions.gen_random_bytes(8), 'hex'),
  title text not null default 'Benimle iletişime geç' check (length(title) <= 120),
  intro text check (length(intro) <= 600),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index lead_forms_owner_idx on public.lead_forms(owner_id);
create index lead_forms_org_idx on public.lead_forms(org_id);
alter table public.lead_forms enable row level security;
create policy "form: sahibi" on public.lead_forms for all to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id));

-- Herkese açık: formun başlığı ve sahibinin adı (başka hiçbir şey dönmez)
create or replace function public.lead_form_info(p_key text)
returns table(title text, intro text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select f.title, f.intro, p.full_name from public.lead_forms f
  left join public.profiles p on p.id = f.owner_id
  where f.key = p_key and f.active;
$$;

-- Herkese açık gönderim: doğrulama + spam koruması + KVKK onay kaydı
create or replace function public.submit_lead(p_key text, p_name text, p_phone text, p_message text, p_consent boolean, p_hp text default '')
returns boolean
language plpgsql security definer set search_path = '' as $$
declare f public.lead_forms%rowtype; v_id uuid; v_phone text; recent int;
begin
  if coalesce(p_hp, '') <> '' then return true; end if;                     -- bot tuzağı: sessizce yok say
  select * into f from public.lead_forms where key = p_key and active;
  if not found then raise exception 'Form bulunamadı'; end if;
  if not coalesce(p_consent, false) then raise exception 'KVKK onayı gerekli'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Ad soyad 2-120 karakter olmalı'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 10 and 15 then raise exception 'Geçerli bir telefon numarası gir'; end if;
  if length(coalesce(p_message, '')) > 1000 then raise exception 'Mesaj en fazla 1000 karakter olabilir'; end if;
  select count(*) into recent from public.prospects
    where owner_id = f.owner_id and extra->>'form' = f.key and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Çok fazla gönderim yapıldı, lütfen daha sonra tekrar dene'; end if;

  insert into public.prospects(org_id, owner_id, full_name, phone, source, channel, stage, temperature, notes, extra)
  values (f.org_id, f.owner_id, trim(p_name), v_phone, 'Web sitesi', 'Web formu', 'liste', 'ilik',
          nullif(trim(coalesce(p_message, '')), ''), jsonb_build_object('form', f.key))
  returning id into v_id;
  insert into public.consents(org_id, prospect_id, kind, granted, method, recorded_by) values
    (f.org_id, v_id, 'kvkk_aydinlatma', true, 'web formu', f.owner_id),
    (f.org_id, v_id, 'acik_riza', true, 'web formu (iletişim için)', f.owner_id);
  return true;
end; $$;
revoke execute on function public.lead_form_info(text), public.submit_lead(text, text, text, text, boolean, text) from public;
grant execute on function public.lead_form_info(text), public.submit_lead(text, text, text, text, boolean, text) to anon, authenticated;
