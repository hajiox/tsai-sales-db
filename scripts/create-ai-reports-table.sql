create table if not exists public.ai_reports (
  month      text primary key,
  content    text not null,
  created_at timestamp with time zone default now()
);
alter table public.ai_reports disable row level security;
grant usage  on schema public            to anon, authenticated;
grant select on table  public.ai_reports to anon, authenticated;
