-- Faz 0: çok ekipli temel şema (Supabase projesi: nm-departmani)

-- ===== Tipler =====
create type public.org_role as enum ('owner','leader','member');
create type public.prospect_stage as enum ('liste','temas','davet','sunum','takip','musteri','is_ortagi','pasif');
create type public.prospect_temp as enum ('sicak','ilik','soguk');
create type public.consent_kind as enum ('kvkk_aydinlatma','acik_riza','iys_ticari_ileti');

-- ===== Yardımcı: updated_at =====
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== Profiller =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  career_level text default 'Guest',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ===== Organizasyonlar (ekipler) =====
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  sponsor_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','passive','left')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create index memberships_sponsor_idx on public.memberships(sponsor_user_id);

-- ===== Yetki yardımcıları (RLS döngüsünü önlemek için security definer) =====
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status <> 'left');
$$;
create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.org_id = p_org and m.user_id = (select auth.uid())
                   and m.status <> 'left' and m.role = any(p_roles));
$$;
create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
                 where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;
revoke execute on function public.is_org_member(uuid), public.has_org_role(uuid, public.org_role[]), public.shares_org_with(uuid) from anon;

-- ===== Yeni kullanıcı: profil + kendi ekibi + owner üyeliği =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  insert into public.profiles(id, full_name) values (new.id, v_name);
  insert into public.organizations(name, owner_id) values (v_name || ' Ekibi', new.id) returning id into v_org;
  insert into public.memberships(org_id, user_id, role) values (v_org, new.id, 'owner');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Adaylar (CRM) =====
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  channel text,
  source text,
  stage public.prospect_stage not null default 'liste',
  temperature public.prospect_temp not null default 'ilik',
  tags text[] not null default '{}',
  notes text,
  next_follow_up_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index prospects_owner_idx on public.prospects(owner_id, stage);
create index prospects_org_idx on public.prospects(org_id);
create index prospects_follow_idx on public.prospects(owner_id, next_follow_up_at) where deleted_at is null;
create trigger prospects_updated before update on public.prospects for each row execute function public.set_updated_at();

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'mesaj' check (kind in ('mesaj','arama','yuz_yuze','sunum','not')),
  channel text,
  summary text,
  occurred_at timestamptz not null default now()
);
create index interactions_prospect_idx on public.interactions(prospect_id, occurred_at desc);
create index interactions_owner_idx on public.interactions(owner_id, occurred_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  title text not null,
  kind text not null default 'genel' check (kind in ('genel','temas','takip','davet','sunum','egitim')),
  due_date date not null default current_date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_owner_due_idx on public.tasks(owner_id, due_date);
create index tasks_org_idx on public.tasks(org_id);
create index tasks_prospect_idx on public.tasks(prospect_id);

-- ===== Mesaj şablonları (org_id null = sistem şablonu) =====
create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  channel text,
  purpose text not null,
  title text not null,
  body text not null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scripts_org_idx on public.scripts(org_id);
create index scripts_owner_idx on public.scripts(owner_id);
create trigger scripts_updated before update on public.scripts for each row execute function public.set_updated_at();

-- ===== KVKK / İYS onay kayıtları =====
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  kind public.consent_kind not null,
  granted boolean not null,
  method text,
  recorded_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
create index consents_prospect_idx on public.consents(prospect_id);
create index consents_org_idx on public.consents(org_id);
create index consents_recorder_idx on public.consents(recorded_by);

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.prospects enable row level security;
alter table public.interactions enable row level security;
alter table public.tasks enable row level security;
alter table public.scripts enable row level security;
alter table public.consents enable row level security;

create policy "profil: kendim veya ekip arkadaşım" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy "profil: sadece kendim günceller" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "org: üyeler görür" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "org: sahibi günceller" on public.organizations for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "üyelik: ekip üyeleri görür" on public.memberships for select to authenticated using (public.is_org_member(org_id));
create policy "üyelik: sahip/lider ekler" on public.memberships for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','leader']::public.org_role[]) and role <> 'owner');
create policy "üyelik: sahip/lider günceller" on public.memberships for update to authenticated
  using (public.has_org_role(org_id, array['owner','leader']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner','leader']::public.org_role[]));

-- Aday verisi kişisel veridir: sadece kaydı oluşturan görür (KVKK). Liderler Faz 2'de toplu KPI fonksiyonu ile görür.
create policy "aday: sahibi" on public.prospects for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and public.is_org_member(org_id));
create policy "etkileşim: sahibi" on public.interactions for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and public.is_org_member(org_id));
create policy "görev: sahibi" on public.tasks for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and public.is_org_member(org_id));
create policy "onay: kaydeden" on public.consents for all to authenticated
  using (recorded_by = (select auth.uid()) and public.is_org_member(org_id))
  with check (recorded_by = (select auth.uid()) and public.is_org_member(org_id));

create policy "şablon: sistem + ekip paylaşımlı + kendim" on public.scripts for select to authenticated
  using (org_id is null or owner_id = (select auth.uid()) or (is_shared and public.is_org_member(org_id)));
create policy "şablon: kendim eklerim" on public.scripts for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_org_member(org_id));
create policy "şablon: kendiminkini düzenlerim" on public.scripts for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and public.is_org_member(org_id));
create policy "şablon: kendiminkini silerim" on public.scripts for delete to authenticated
  using (owner_id = (select auth.uid()));
