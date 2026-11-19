-- Faz 2: ekip daveti, randevu/etkinlik, akademi ilerlemesi, ekip özeti

-- ===== Davetler =====
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  role public.org_role not null default 'member' check (role <> 'owner'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sponsor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  max_uses int not null default 1 check (max_uses between 1 and 100),
  uses int not null default 0,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations(org_id);
create index invitations_created_by_idx on public.invitations(created_by);
create index invitations_sponsor_idx on public.invitations(sponsor_user_id);
alter table public.invitations enable row level security;
create policy "davet: sahip/lider görür" on public.invitations for select to authenticated
  using (private.has_org_role(org_id, array['owner','leader']::public.org_role[]));
create policy "davet: sahip/lider oluşturur" on public.invitations for insert to authenticated
  with check (created_by = (select auth.uid()) and private.has_org_role(org_id, array['owner','leader']::public.org_role[])
              and (role = 'member' or private.has_org_role(org_id, array['owner']::public.org_role[])));
create policy "davet: sahip/lider iptal eder" on public.invitations for update to authenticated
  using (private.has_org_role(org_id, array['owner','leader']::public.org_role[]))
  with check (private.has_org_role(org_id, array['owner','leader']::public.org_role[]));

create or replace function public.invitation_info(p_code text)
returns table(org_name text, inviter_name text, role public.org_role, valid boolean, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, p.full_name, i.role,
         (not i.revoked and i.expires_at > now() and i.uses < i.max_uses),
         exists (select 1 from public.memberships m where m.org_id = i.org_id and m.user_id = (select auth.uid()))
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  left join public.profiles p on p.id = i.created_by
  where i.code = p_code;
$$;

create or replace function public.accept_invitation(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.invitations%rowtype; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Giriş yapmalısın'; end if;
  select * into v from public.invitations where code = p_code for update;
  if not found then raise exception 'Davet bulunamadı'; end if;
  if exists (select 1 from public.memberships where org_id = v.org_id and user_id = uid) then return v.org_id; end if;
  if v.revoked or v.expires_at <= now() or v.uses >= v.max_uses then raise exception 'Davetin süresi dolmuş ya da kullanılmış'; end if;
  insert into public.memberships(org_id, user_id, role, sponsor_user_id) values (v.org_id, uid, v.role, v.sponsor_user_id);
  update public.invitations set uses = uses + 1 where id = v.id;
  return v.org_id;
end; $$;
revoke execute on function public.invitation_info(text), public.accept_invitation(text) from public, anon;
grant execute on function public.invitation_info(text), public.accept_invitation(text) to authenticated;

-- ===== Randevu ve etkinlikler =====
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  title text not null check (length(title) <= 160),
  kind text not null default 'sunum' check (kind in ('sunum','birebir','egitim','etkinlik','diger')),
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 5 and 1440),
  location text,
  notes text,
  status text not null default 'planli' check (status in ('planli','yapildi','gelmedi','iptal')),
  is_team_event boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_owner_idx on public.appointments(owner_id, starts_at);
create index appointments_org_idx on public.appointments(org_id, starts_at) where is_team_event;
create index appointments_prospect_idx on public.appointments(prospect_id);
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();
alter table public.appointments enable row level security;
create policy "randevu: sahibi" on public.appointments for all to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id)
              and (not is_team_event or private.has_org_role(org_id, array['owner','leader']::public.org_role[])));
create policy "randevu: ekip etkinliğini üyeler görür" on public.appointments for select to authenticated
  using (is_team_event and private.is_org_member(org_id));

create table public.event_rsvps (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null check (status in ('geliyorum','belki','gelemem')),
  updated_at timestamptz not null default now(),
  primary key (appointment_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps(user_id);
alter table public.event_rsvps enable row level security;
create policy "katılım: etkinliği görenler görür" on public.event_rsvps for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "katılım: kendim yazarım" on public.event_rsvps for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.appointments a where a.id = appointment_id and a.is_team_event));
create policy "katılım: kendim güncellerim" on public.event_rsvps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "katılım: kendim silerim" on public.event_rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

-- ===== Akademi ilerlemesi (kişiye ait, ekipten bağımsız) =====
create table public.academy_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id text not null check (length(item_id) <= 60),
  kind text not null check (kind in ('ders','gorev')),
  score int check (score between 0 and 100),
  completed_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.academy_progress enable row level security;
create policy "akademi: kendi ilerlemem" on public.academy_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===== Ekip özeti: yalnızca toplu sayılar; adayların kişisel verisi dönmez =====
-- Sahip/lider tüm sütunları görür; üyeler sıralama için ad, rol, puan ve akademi sayısını görür.
create or replace function public.team_overview(p_org uuid)
returns table(user_id uuid, full_name text, career_level text, role public.org_role, sponsor_user_id uuid, status text,
              joined_at timestamptz, last_activity_at timestamptz, contacts_7d int, presentations_7d int, invites_7d int,
              wins_30d int, active_prospects int, academy_done int, points_30d int)
language plpgsql stable security definer set search_path = '' as $$
declare is_lead boolean;
begin
  if not private.is_org_member(p_org) then raise exception 'Bu ekibin üyesi değilsin'; end if;
  is_lead := private.has_org_role(p_org, array['owner','leader']::public.org_role[]);
  return query
  with m as (
    select mm.user_id, mm.role, mm.sponsor_user_id, mm.status, mm.joined_at from public.memberships mm
    where mm.org_id = p_org and mm.status <> 'left'
  ), act as (
    select i.owner_id uid,
      max(i.occurred_at) last_at,
      count(*) filter (where i.occurred_at >= now() - interval '7 days' and i.kind <> 'not')::int c7,
      count(*) filter (where i.occurred_at >= now() - interval '7 days' and i.kind = 'sunum')::int s7,
      count(*) filter (where i.occurred_at >= now() - interval '30 days' and i.kind in ('mesaj','arama','yuz_yuze'))::int c30,
      count(*) filter (where i.occurred_at >= now() - interval '30 days' and i.kind = 'sunum')::int s30
    from public.interactions i where i.owner_id in (select m.user_id from m) group by i.owner_id
  ), st as (
    select e.owner_id uid,
      count(*) filter (where e.to_stage = 'davet' and e.from_stage is not null and e.occurred_at >= now() - interval '7 days')::int i7,
      count(*) filter (where e.to_stage = 'davet' and e.from_stage is not null and e.occurred_at >= now() - interval '30 days')::int i30,
      count(*) filter (where e.to_stage in ('musteri','is_ortagi') and e.from_stage not in ('musteri','is_ortagi') and e.occurred_at >= now() - interval '30 days')::int w30
    from public.stage_events e where e.owner_id in (select m.user_id from m) group by e.owner_id
  ), pr as (
    select p.owner_id uid, count(*)::int n from public.prospects p
    where p.owner_id in (select m.user_id from m) and p.deleted_at is null and p.stage in ('liste','temas','davet','sunum','takip')
    group by p.owner_id
  ), ac as (
    select a.user_id uid, count(*)::int n,
      count(*) filter (where a.completed_at >= now() - interval '30 days')::int n30
    from public.academy_progress a where a.user_id in (select m.user_id from m) group by a.user_id
  )
  select m.user_id, pf.full_name, pf.career_level, m.role, m.sponsor_user_id,
    case when m.status = 'passive' then 'passive'
         when coalesce(act.last_at, m.joined_at) >= now() - interval '14 days' then 'active' else 'quiet' end,
    m.joined_at,
    case when is_lead then act.last_at end,
    case when is_lead then coalesce(act.c7, 0) end,
    case when is_lead then coalesce(act.s7, 0) end,
    case when is_lead then coalesce(st.i7, 0) end,
    case when is_lead then coalesce(st.w30, 0) end,
    case when is_lead then coalesce(pr.n, 0) end,
    coalesce(ac.n, 0),
    (coalesce(act.c30, 0) + 3 * coalesce(act.s30, 0) + 2 * coalesce(st.i30, 0) + 5 * coalesce(st.w30, 0) + 2 * coalesce(ac.n30, 0))::int
  from m
  left join public.profiles pf on pf.id = m.user_id
  left join act on act.uid = m.user_id
  left join st on st.uid = m.user_id
  left join pr on pr.uid = m.user_id
  left join ac on ac.uid = m.user_id
  order by m.joined_at;
end; $$;
revoke execute on function public.team_overview(uuid) from public, anon;
grant execute on function public.team_overview(uuid) to authenticated;
