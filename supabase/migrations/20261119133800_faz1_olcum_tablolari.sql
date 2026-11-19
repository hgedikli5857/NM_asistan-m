-- Faz 1 / Ölçüm ve uyum: aşama geçmişi, hedefler, haftalık hesap verme, gelir
create table public.stage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_stage public.prospect_stage,
  to_stage public.prospect_stage not null,
  occurred_at timestamptz not null default now()
);
create index stage_events_owner_idx on public.stage_events(owner_id, occurred_at desc);
create index stage_events_prospect_idx on public.stage_events(prospect_id);
create index stage_events_org_idx on public.stage_events(org_id);

create or replace function private.log_stage_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.stage_events(org_id, prospect_id, owner_id, from_stage, to_stage, occurred_at)
    values (new.org_id, new.id, new.owner_id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            case when tg_op = 'INSERT' then new.created_at else now() end);
  end if;
  return new;
end; $$;
revoke execute on function private.log_stage_change() from public, anon, authenticated;
create trigger prospects_stage_log after insert or update of stage on public.prospects
  for each row execute function private.log_stage_change();

insert into public.stage_events(org_id, prospect_id, owner_id, from_stage, to_stage, occurred_at)
select org_id, id, owner_id, null, stage, created_at from public.prospects;

create table public.kpi_targets (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  daily_contacts int not null default 5 check (daily_contacts between 0 and 200),
  daily_followups int not null default 5 check (daily_followups between 0 and 200),
  weekly_invites int not null default 10 check (weekly_invites between 0 and 500),
  weekly_presentations int not null default 3 check (weekly_presentations between 0 and 200),
  monthly_income numeric(12,2) not null default 50000 check (monthly_income >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index kpi_targets_user_idx on public.kpi_targets(user_id);
create trigger kpi_targets_updated before update on public.kpi_targets for each row execute function public.set_updated_at();

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  planned text, actual text, gap_reason text,
  actions text[] not null default '{}',
  score int check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, week_start)
);
create index weekly_reviews_org_idx on public.weekly_reviews(org_id);
create trigger weekly_reviews_updated before update on public.weekly_reviews for each row execute function public.set_updated_at();

create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  source text, note text,
  created_at timestamptz not null default now()
);
create index income_entries_owner_idx on public.income_entries(owner_id, month);
create index income_entries_org_idx on public.income_entries(org_id);

alter table public.stage_events enable row level security;
alter table public.kpi_targets enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.income_entries enable row level security;

create policy "aşama geçmişi: sahibi görür" on public.stage_events for select to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id));
create policy "hedef: sahibi" on public.kpi_targets for all to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (user_id = (select auth.uid()) and private.is_org_member(org_id));
create policy "haftalık: sahibi" on public.weekly_reviews for all to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id));
create policy "gelir: sahibi" on public.income_entries for all to authenticated
  using (owner_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id));
