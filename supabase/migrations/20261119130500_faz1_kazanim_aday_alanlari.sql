-- Faz 1 / Kazanım: aday alanları + son temas tarihini otomatik güncelleme
alter table public.prospects
  add column instagram text,
  add column occupation text,
  add column interests text,
  add column extra jsonb not null default '{}'::jsonb,
  add column legacy_id text;
-- Eski uygulamadan aynı kaydın iki kez içe aktarılmasını engelle
create unique index prospects_owner_legacy_uq on public.prospects(owner_id, legacy_id) where legacy_id is not null;
-- Etkileşim eklenince adayın son temas tarihini güncelle
create or replace function private.touch_prospect_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.prospects set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
  where id = new.prospect_id and owner_id = new.owner_id;
  return new;
end; $$;
revoke execute on function private.touch_prospect_contact() from public, anon, authenticated;
create trigger interactions_touch after insert on public.interactions for each row execute function private.touch_prospect_contact();
