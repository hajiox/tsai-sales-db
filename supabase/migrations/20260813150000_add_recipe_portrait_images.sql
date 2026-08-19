begin;

alter table public.recipe_web_images
  add column if not exists image_role text not null default 'gallery';

alter table public.recipe_web_images
  drop constraint if exists recipe_web_images_image_role_check;

alter table public.recipe_web_images
  add constraint recipe_web_images_image_role_check
  check (image_role in ('gallery', 'portrait'));

create index if not exists recipe_web_images_recipe_role_sort_idx
  on public.recipe_web_images(recipe_id, image_role, sort_order, created_at);

create unique index if not exists recipe_web_images_single_portrait_idx
  on public.recipe_web_images(recipe_id)
  where image_role = 'portrait';

comment on column public.recipe_web_images.image_role is
  '画像の用途。galleryはWeb商品画像一覧、portraitはレシピごと1枚の縦長ポートレート画像。';

commit;
