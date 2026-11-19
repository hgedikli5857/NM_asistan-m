-- Yetki fonksiyonlarını API'ye kapalı "private" şemasına taşı (Supabase güvenlik uyarısı düzeltmesi)
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_org_member(uuid) set schema private;
alter function public.has_org_role(uuid, public.org_role[]) set schema private;
alter function public.shares_org_with(uuid) set schema private;
alter function public.handle_new_user() set schema private;

revoke execute on function private.is_org_member(uuid), private.has_org_role(uuid, public.org_role[]), private.shares_org_with(uuid) from public, anon;
grant execute on function private.is_org_member(uuid), private.has_org_role(uuid, public.org_role[]), private.shares_org_with(uuid) to authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
