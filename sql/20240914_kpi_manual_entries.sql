-- 手入力KPI保存テーブル
create schema if not exists kpi;

create table if not exists kpi.kpi_manual_entries_v1 (
  metric text not null,
  channel_code text not null,
  month date not null,
  amount numeric(14,0) not null default 0,
  note text,
  updated_at timestamptz not null default now(),
  primary key (metric, channel_code, month)
);
