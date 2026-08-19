begin;

drop index if exists public.recipe_web_images_single_portrait_idx;

comment on column public.recipe_web_images.image_role is
  '画像の用途。galleryはWeb商品画像一覧、portraitは枚数制限なしの縦長ポートレート画像一覧。';

commit;
