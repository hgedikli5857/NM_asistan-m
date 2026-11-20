-- crm-panel (mdhwvwgyzjvcfgvcdlcg) tarafı: NM Departmanı köprüsü
-- Yalnızca OKUMA yapar. Mevcut tablolara/bota dokunmaz.
-- Hassas alanlar (saglik_notlari, gelir_tahmini, medeni_durum, cocuk_sayisi, yas) asla dışarı verilmez.
-- Korunan kişiler (is_protected) için yalnızca id + telefon + konuşma özeti verilir (eşleştirme için).

create schema if not exists nmd_bridge;
revoke all on schema nmd_bridge from public, anon, authenticated;

create table if not exists nmd_bridge.tokens (
  token_hash text primary key,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
revoke all on nmd_bridge.tokens from public, anon, authenticated;

create or replace function nmd_bridge.check_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  update nmd_bridge.tokens set last_used_at = now() where token_hash = h;
  if not found then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end; $$;
revoke all on function nmd_bridge.check_token(text) from public, anon, authenticated;

create or replace function public.nmd_export(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform nmd_bridge.check_token(p_token);
  with conv as (
    select distinct on (c.lead_id) c.lead_id, c.id, c.handler, c.handoff_status, c.handoff_reason,
           c.last_message_at, left(c.last_message_preview, 160) as preview, c.unread_count,
           c.meeting_start, c.meeting_method, c.form_completed_at,
           (select count(*) from public.messages m where m.conversation_id = c.id) as msg_count,
           (select max(m.created_at) from public.messages m where m.conversation_id = c.id and m.direction = 'gelen') as last_in_at
    from public.conversations c
    order by c.lead_id, c.last_message_at desc nulls last
  )
  select jsonb_build_object(
    'generated_at', now(),
    'leads', coalesce(jsonb_agg(
      case when l.is_protected then
        jsonb_build_object('id', l.id, 'phone', l.phone, 'protected', true,
                           'updated_at', l.updated_at, 'conv', to_jsonb(cv) - 'lead_id')
      else
        jsonb_build_object(
          'id', l.id, 'protected', false,
          'name', coalesce(nullif(btrim(l.ad_soyad), ''), l.full_name),
          'phone', l.phone, 'source', l.source, 'status', l.status, 'asama', l.asama,
          'liste_turu', l.liste_turu, 'kanal', l.kanal, 'instagram', l.instagram,
          'meslek', l.meslek, 'ilgi', l.ilgi_alanlari, 'sehir', l.sehir,
          'notes', nullif(concat_ws(E'\n', nullif(btrim(l.notes), ''), nullif(btrim(l.ozel_not), '')), ''),
          'created_at', l.created_at, 'updated_at', l.updated_at,
          'tags', coalesce((select jsonb_agg(t.name order by t.name) from public.lead_tags lt
                            join public.tags t on t.id = lt.tag_id where lt.lead_id = l.id), '[]'::jsonb),
          'conv', case when cv.id is null then null else to_jsonb(cv) - 'lead_id' end)
      end), '[]'::jsonb))
  into v
  from public.leads l
  left join conv cv on cv.lead_id = l.id
  where not l.is_protected or cv.id is not null;
  return v;
end; $$;

create or replace function public.nmd_messages(p_token text, p_lead_id uuid, p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform nmd_bridge.check_token(p_token);
  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) into v from (
    select m.direction, m.sender_type, m.content_type, left(m.body, 2000) as body, m.created_at
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where c.lead_id = p_lead_id
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) x;
  return v;
end; $$;

revoke all on function public.nmd_export(text) from public, authenticated;
revoke all on function public.nmd_messages(text, uuid, int) from public, authenticated;
grant execute on function public.nmd_export(text) to anon;
grant execute on function public.nmd_messages(text, uuid, int) to anon;
