-- NM Departmanı tarafı: crm-panel (WhatsApp bot CRM) köprüsü
-- Bağlantı bilgisi private şemada; yalnızca service_role (crm edge function) okur.

create table if not exists private.crm_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  crm_url text not null,
  crm_key text not null,
  token text not null,
  last_sync_at timestamptz,
  last_result jsonb,
  created_at timestamptz not null default now()
);
revoke all on private.crm_links from public, anon, authenticated;

-- Telefonu karşılaştırma anahtarına çevir: son 10 hane (5xx...)
create or replace function private.phone_key(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

create index if not exists prospects_owner_phonekey_idx
  on public.prospects (owner_id, private.phone_key(phone)) where deleted_at is null;

-- Edge function için: bağlantıyı getir (service_role)
create or replace function public.crm_link_get(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(l) from private.crm_links l where l.user_id = p_user
$$;

-- Kullanıcı için durum (token göstermez)
create or replace function public.crm_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('linked', true, 'last_sync_at', l.last_sync_at, 'last_result', l.last_result,
      'linked_count', (select count(*) from public.prospects p
                       where p.owner_id = l.user_id and p.deleted_at is null and p.extra ? 'crm'))
    from private.crm_links l where l.user_id = auth.uid()), jsonb_build_object('linked', false))
$$;

-- Senkron: crm export'unu kullanıcının adaylarına uygula (service_role)
create or replace function public.crm_apply_sync(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  lk private.crm_links%rowtype;
  r jsonb; pid uuid; cur record; blk jsonb; st public.prospect_stage; tp public.prospect_temp;
  lastc timestamptz;
  n_new int := 0; n_upd int := 0; n_link int := 0; n_skip int := 0;
  stage_rank constant text[] := array['liste','temas','davet','sunum','takip','musteri','is_ortagi'];
begin
  select * into lk from private.crm_links where user_id = p_user;
  if not found then raise exception 'crm_not_linked'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_payload->'leads', '[]'::jsonb)) loop
    lastc := nullif(r->'conv'->>'last_message_at', '')::timestamptz;
    blk := jsonb_strip_nulls(jsonb_build_object(
      'id', r->>'id', 'protected', (r->>'protected')::boolean, 'asama', r->>'asama',
      'source', r->>'source', 'sehir', r->>'sehir', 'conv', r->'conv', 'synced_at', now()));

    -- 1) daha önce bağlanmış aday
    select p.id, p.stage, p.legacy_id, p.tags into cur from public.prospects p
     where p.owner_id = p_user and p.deleted_at is null
       and (p.legacy_id = 'crm:' || (r->>'id') or p.extra->'crm'->>'id' = r->>'id')
     limit 1;
    -- 2) telefonla eşleşen mevcut aday
    if cur.id is null and private.phone_key(r->>'phone') is not null then
      select p.id, p.stage, p.legacy_id, p.tags into cur from public.prospects p
       where p.owner_id = p_user and p.deleted_at is null
         and private.phone_key(p.phone) = private.phone_key(r->>'phone')
       order by p.created_at limit 1;
      if cur.id is not null then n_link := n_link + 1; end if;
    end if;

    if cur.id is not null then
      st := null;
      if not (r->>'protected')::boolean and cur.legacy_id like 'crm:%' then
        st := case r->>'asama'
          when 'ilk_temas' then 'temas' when 'bilgi_verildi' then 'temas'
          when 'gorusme_planlandi' then 'davet' when 'gorusme_yapildi' then 'sunum'
          when 'musteri' then 'musteri' when 'ekip_arkadasi' then 'is_ortagi'
          else null end::public.prospect_stage;
        -- yalnızca ileri taşı
        if st is not null and coalesce(array_position(stage_rank, st::text), 0)
             <= coalesce(array_position(stage_rank, cur.stage::text), 99) then st := null; end if;
      end if;
      update public.prospects p set
        extra = coalesce(p.extra, '{}'::jsonb) || jsonb_build_object('crm', blk),
        tags = case when (r->>'protected')::boolean then p.tags
                    else (select coalesce(array_agg(distinct t), '{}') from unnest(p.tags || array['WhatsApp bot']) t) end,
        stage = coalesce(st, p.stage),
        last_contact_at = greatest(p.last_contact_at, lastc),
        instagram = coalesce(p.instagram, nullif(r->>'instagram', '')),
        occupation = coalesce(p.occupation, nullif(r->>'meslek', '')),
        interests = coalesce(p.interests, nullif(r->>'ilgi', ''))
      where p.id = cur.id;
      n_upd := n_upd + 1;
    elsif (r->>'protected')::boolean then
      n_skip := n_skip + 1;  -- korunan kişiler yeni aday olarak eklenmez
    else
      st := case r->>'asama'
        when 'ilk_temas' then 'temas' when 'bilgi_verildi' then 'temas'
        when 'gorusme_planlandi' then 'davet' when 'gorusme_yapildi' then 'sunum'
        when 'musteri' then 'musteri' when 'ekip_arkadasi' then 'is_ortagi'
        when 'ilgilenmiyor' then 'pasif' else 'liste' end::public.prospect_stage;
      tp := case r->>'liste_turu' when 'sicak' then 'sicak' when 'ilik' then 'ilik'
            when 'soguk' then 'soguk' else 'ilik' end::public.prospect_temp;
      insert into public.prospects (org_id, owner_id, full_name, phone, channel, source, stage, temperature,
        tags, notes, instagram, occupation, interests, extra, legacy_id, last_contact_at, created_at)
      values (lk.org_id, p_user,
        coalesce(nullif(btrim(r->>'name'), ''), r->>'phone', 'WhatsApp adayı'),
        r->>'phone', 'WhatsApp', 'WhatsApp bot', st, tp,
        (select coalesce(array_agg(distinct t), '{}') from (
           select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) t union all select 'WhatsApp bot') x),
        nullif(r->>'notes', ''), nullif(r->>'instagram', ''), nullif(r->>'meslek', ''), nullif(r->>'ilgi', ''),
        jsonb_build_object('crm', blk), 'crm:' || (r->>'id'), lastc,
        coalesce(nullif(r->>'created_at', '')::timestamptz, now()));
      n_new := n_new + 1;
    end if;
    cur := null;
  end loop;

  update private.crm_links set last_sync_at = now(),
    last_result = jsonb_build_object('yeni', n_new, 'guncellenen', n_upd, 'telefonla_eslesen', n_link,
                                     'atlanan_korunan', n_skip, 'toplam', jsonb_array_length(coalesce(p_payload->'leads','[]'::jsonb)))
  where user_id = p_user;
  return (select last_result from private.crm_links where user_id = p_user);
end; $$;

revoke all on function public.crm_link_get(uuid) from public, anon, authenticated;
revoke all on function public.crm_apply_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crm_link_get(uuid) to service_role;
grant execute on function public.crm_apply_sync(uuid, jsonb) to service_role;
revoke all on function public.crm_status() from public, anon;
grant execute on function public.crm_status() to authenticated;
