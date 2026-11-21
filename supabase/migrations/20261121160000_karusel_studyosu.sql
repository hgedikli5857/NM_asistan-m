-- Karusel Stüdyosu: içerik takviminde karusel biçimi ve sayfa metinleri.
-- Görseller saklanmaz (kullanıcının cihazında üretilir); yalnızca metin ve marka ayarları durur. Fotoğraf hiç gönderilmez.
alter table public.content_posts drop constraint if exists content_posts_format_check;
alter table public.content_posts add constraint content_posts_format_check
  check (format = any (array['gonderi', 'reels', 'karusel', 'story', 'canli', 'video']));

alter table public.content_posts add column if not exists carousel jsonb;
alter table public.content_posts add constraint content_posts_carousel_check
  check (carousel is null or (jsonb_typeof(carousel) = 'object' and pg_column_size(carousel) <= 40000));

comment on column public.content_posts.carousel is
  'Karusel Stüdyosu: {v, topic, slides[{layout,badge,title,ribbon,body,items[{label,text}],quote,emblem}], brand{web,wa,handle,follow}}. Görsel ve fotoğraf tutulmaz.';
