-- Reels Stüdyosu: içerik takvimindeki bir Reels'in senaryosu (storyboard).
-- Yalnızca yeni, boş bırakılabilir bir sütun eklenir; mevcut kayıtlar etkilenmez.
-- Video dosyası saklanmaz (kullanıcının telefonunda kalır); burada sadece metin ve ayarlar durur.
alter table public.content_posts
  add column if not exists storyboard jsonb;

alter table public.content_posts
  add constraint content_posts_storyboard_check
  check (storyboard is null or (jsonb_typeof(storyboard) = 'object' and pg_column_size(storyboard) <= 20000));

comment on column public.content_posts.storyboard is
  'Reels Stüdyosu senaryosu: {v, template, scenes[{top,bot}], slogan, cta, kw, handle}. Video dosyası tutulmaz.';
