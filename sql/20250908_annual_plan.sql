-- 年間目標・営業目標の手入力保存用（RLSなし・最小構成）
create schema if not exists kpi;

create table if not exists kpi.annual_targets_v1 (
  id bigserial primary key,
  fiscal_year_start date not null,               -- 例: 2025-08-01
  channel_code text not null check (channel_code in ('WEB','WHOLESALE','STORE','SHOKU')),
  month_date date not null,                      -- 月初
  target_amount_yen numeric(14,0) not null default 0,
  unique (fiscal_year_start, channel_code, month_date)
);

create table if not exists kpi.sales_goals_manual_v1 (
  id bigserial primary key,
  fiscal_year_start date not null,
  month_date date not null,                      -- 月初
  metric_code text not null,                     -- 例: new_clients_target / new_clients_actual / proposals_target / proposals_actual / oem_target / oem_actual
  value numeric(14,2) not null default 0,
  unique (fiscal_year_start, month_date, metric_code)
);
