-- AI kullanım limiti (Edge Function 'ai' kullanır)
create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "ai kullanım: kendim görürüm" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Yalnızca sunucu fonksiyonu (service_role) çağırır: sayacı artırır, kalan hakkı döner (negatif = limit aşıldı)
create or replace function public.ai_consume(p_user uuid, p_limit int) returns int
language plpgsql security definer set search_path = '' as $$
declare c int;
begin
  insert into public.ai_usage(user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into c;
  return p_limit - c;
end; $$;
revoke execute on function public.ai_consume(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_consume(uuid, int) to service_role;
