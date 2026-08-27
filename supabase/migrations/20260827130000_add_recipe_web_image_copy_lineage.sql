begin;

alter table public.recipe_web_images
  add column if not exists copied_from_image_id uuid
  references public.recipe_web_images(id) on delete set null;

create unique index if not exists recipe_web_images_portrait_copy_unique_idx
  on public.recipe_web_images(recipe_id, copied_from_image_id)
  where image_role = 'portrait' and copied_from_image_id is not null;

comment on column public.recipe_web_images.copied_from_image_id is
  'Web商品画像をポートレート画像へ複製した場合のコピー元。画像ファイル自体は別Blobとして保存する。';

commit;
