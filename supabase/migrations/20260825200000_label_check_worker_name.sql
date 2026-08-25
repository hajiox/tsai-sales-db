alter table public.label_checks
  add column if not exists worker_name text
  check (worker_name is null or char_length(btrim(worker_name)) between 1 and 50);

comment on column public.label_checks.worker_name is
  '裏ラベルチェックを実施したスタッフ名。名字だけの入力を許可し、新規チェックではAPIで必須化する';
