-- Rol değiştirme / üye çıkarma yalnızca ekip sahibinde; sahibin satırı değiştirilemez
drop policy "üyelik: sahip/lider günceller" on public.memberships;
create policy "üyelik: yalnızca sahip günceller" on public.memberships for update to authenticated
  using (private.has_org_role(org_id, array['owner']::public.org_role[]) and role <> 'owner')
  with check (private.has_org_role(org_id, array['owner']::public.org_role[]) and role <> 'owner');

-- Ekipten kendin ayrılma (sahip hariç)
create or replace function public.leave_team(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.memberships where org_id = p_org and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'Ekip sahibi kendi ekibinden ayrılamaz';
  end if;
  update public.memberships set status = 'left' where org_id = p_org and user_id = (select auth.uid());
end; $$;
revoke execute on function public.leave_team(uuid) from public, anon;
grant execute on function public.leave_team(uuid) to authenticated;
