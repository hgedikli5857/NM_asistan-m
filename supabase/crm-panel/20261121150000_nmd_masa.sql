-- crm-panel: İletişim Masası köprüsü (token korumalı)
-- nmd_desk: günlük rapor + öncelik verisi (salt okuma)
-- nmd_outbox_add: giden kutusuna ekleme (giden_kutusu tetikleyicileri 10 dk / 30 gün / pencere kurallarını uygular)
-- nmd_quick_reply_add: hazır cevap ekleme

create or replace function public.nmd_desk(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; since timestamptz := now() - interval '24 hours';
begin
  perform nmd_bridge.check_token(p_token);
  select jsonb_build_object(
    'generated_at', now(),
    'report', jsonb_build_object(
      'gelen_mesaj', (select count(*) from public.messages m where m.direction = 'gelen' and m.created_at > since),
      'gelen_kisi', (select count(distinct c.lead_id) from public.messages m join public.conversations c on c.id = m.conversation_id
                     where m.direction = 'gelen' and m.created_at > since),
      'bot', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.bot_events where created_at > since group by kind) x), '{}'::jsonb),
      'giden', jsonb_build_object(
        'gonderildi', (select count(*) from public.giden_kutusu where durum = 'gonderildi' and coalesce(gonderim_zamani, olusturma) > since),
        'bekliyor', (select count(*) from public.giden_kutusu where durum in ('bekliyor', 'gonderiliyor')),
        'onay_bekliyor', (select count(*) from public.giden_kutusu where durum = 'onay_bekliyor'),
        'hata', (select count(*) from public.giden_kutusu where durum = 'hata' and olusturma > since)),
      'devir_bekleyen', (select count(*) from public.conversations where handoff_status = 'bekliyor')),
    'convs', coalesce((select jsonb_agg(x order by x.last_message_at desc) from (
      select c.lead_id, l.is_protected as protected, c.handler, c.handoff_status, left(c.handoff_reason, 160) as handoff_reason,
             c.unread_count as unread, c.last_message_at,
             lm.direction as last_dir, lm.sender_type as last_sender,
             li.created_at as last_in_at, left(li.body, 280) as last_in_body, li.content_type as last_in_type,
             (select max(m2.created_at) from public.messages m2 where m2.conversation_id = c.id and m2.direction = 'giden') as last_out_at,
             (select count(*) from public.messages m3 where m3.conversation_id = c.id and m3.direction = 'gelen' and m3.created_at > since) as in_24
      from (select distinct on (lead_id) * from public.conversations order by lead_id, last_message_at desc nulls last) c
      join public.leads l on l.id = c.lead_id
      left join lateral (select m.direction, m.sender_type from public.messages m where m.conversation_id = c.id and m.sender_type <> 'sistem'
                         order by m.created_at desc limit 1) lm on true
      left join lateral (select m.created_at, m.body, m.content_type from public.messages m where m.conversation_id = c.id and m.direction = 'gelen'
                         order by m.created_at desc limit 1) li on true
      where c.last_message_at > now() - interval '30 days'
      order by c.last_message_at desc limit 300) x), '[]'::jsonb),
    'etkinlikler', coalesce((select jsonb_agg(e order by e.tarih_saat) from (
      select ek.id, ek.baslik, ek.tur, ek.tarih_saat, ek.bitis_saat, ek.yer_tipi, ek.semt, ek.adres, ek.online_baglanti, ek.kontenjan,
             coalesce((select sum(k.kisi_sayisi) from public.etkinlik_katilimcilari k where k.etkinlik_id = ek.id and k.durum = 'kayitli'), 0) as kayitli,
             coalesce((select jsonb_agg(jsonb_build_object('lead_id', k.lead_id, 'durum', k.durum, 'kisi', k.kisi_sayisi))
                       from public.etkinlik_katilimcilari k where k.etkinlik_id = ek.id), '[]'::jsonb) as katilimcilar
      from public.etkinlikler ek where ek.aktif and ek.tarih_saat > now() - interval '3 hours') e), '[]'::jsonb),
    'outbox', coalesce((select jsonb_agg(o order by o.olusturma desc) from (
      select g.id, g.lead_id, g.durum, g.olusturan, g.olusturma, g.gonderim_zamani, left(g.hata_detay, 160) as hata, left(g.mesaj, 90) as ozet
      from public.giden_kutusu g order by g.olusturma desc limit 20) o), '[]'::jsonb),
    'quick_replies', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'body', q.body) order by q.created_at desc)
                               from public.quick_replies q), '[]'::jsonb)
  ) into v;
  return v;
end; $$;

create or replace function public.nmd_outbox_add(p_token text, p_lead_id uuid, p_mesaj text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.giden_kutusu%rowtype;
begin
  perform nmd_bridge.check_token(p_token);
  if p_mesaj is null or char_length(btrim(p_mesaj)) < 1 or char_length(btrim(p_mesaj)) > 2000 then
    raise exception 'Mesaj 1-2000 karakter olmalı';
  end if;
  if p_mesaj ~* '(network\s*marketing|\mmlm\M|çok\s*katmanl|ponzi)' then
    raise exception 'Marka filtresi: yasak terim içeren mesaj kuyruğa eklenemez';
  end if;
  insert into public.giden_kutusu (lead_id, mesaj, olusturan) values (p_lead_id, p_mesaj, 'panel') returning * into r;
  return jsonb_build_object('id', r.id, 'durum', r.durum, 'olusturma', r.olusturma);
end; $$;

create or replace function public.nmd_quick_reply_add(p_token text, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.quick_replies%rowtype;
begin
  perform nmd_bridge.check_token(p_token);
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'Başlık ve metin gerekli'; end if;
  insert into public.quick_replies (title, body) values (left(btrim(p_title), 80), left(btrim(p_body), 2000)) returning * into r;
  return jsonb_build_object('id', r.id, 'title', r.title);
end; $$;

revoke all on function public.nmd_desk(text) from public, authenticated;
revoke all on function public.nmd_outbox_add(text, uuid, text) from public, authenticated;
revoke all on function public.nmd_quick_reply_add(text, text, text) from public, authenticated;
grant execute on function public.nmd_desk(text) to anon;
grant execute on function public.nmd_outbox_add(text, uuid, text) to anon;
grant execute on function public.nmd_quick_reply_add(text, text, text) to anon;
