begin;

alter table public.recipe_web_images
  drop constraint if exists recipe_web_images_image_role_check;

alter table public.recipe_web_images
  add constraint recipe_web_images_image_role_check
  check (image_role in ('gallery', 'portrait', 'non_amazon', 'base_only'));

alter table public.recipe_web_images
  drop constraint if exists recipe_web_images_source_type_check;

alter table public.recipe_web_images
  add constraint recipe_web_images_source_type_check
  check (source_type in ('manual', 'rakuten', 'mercari', 'base', 'shared_folder'));

comment on column public.recipe_web_images.image_role is
  '画像用途。galleryは通常EC画像、portraitはSNS用縦長画像、non_amazonはAmazonとBASEを除くEC末尾画像、base_onlyはBASE専用末尾画像。';

comment on column public.recipe_web_images.source_type is
  '画像取得元。manual、rakuten、mercari、base、shared_folderのいずれか。';

commit;
