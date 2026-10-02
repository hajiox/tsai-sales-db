-- API and Bridge must never acquire the same financial task concurrently.
CREATE OR REPLACE FUNCTION public.guard_finance_acquisition_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE task_kind text; task_channel text;
BEGIN
  IF NEW.status NOT IN ('queued','running','waiting_for_user') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'web_sales_acquisition_runs' THEN task_kind := NEW.kind;
  ELSE
    task_kind := CASE NEW.task_key WHEN 'web_sales_import' THEN 'sales' WHEN 'ec_profit_import' THEN 'ec_profit' WHEN 'ad_cost_import' THEN 'advertising' END;
    IF task_kind IS NULL THEN RETURN NEW; END IF;
  END IF;
  task_channel := NEW.channel;
  PERFORM pg_advisory_xact_lock(hashtextextended('finance-acquisition:' || task_kind || ':' || task_channel,0));
  IF EXISTS (SELECT 1 FROM public.web_sales_acquisition_runs r WHERE r.kind=task_kind AND r.channel=task_channel
    AND r.status IN ('queued','running','waiting_for_user') AND r.id<>NEW.id
    AND daterange(r.period_start,r.period_end,'[]') && daterange(NEW.period_start,NEW.period_end,'[]'))
    OR EXISTS (SELECT 1 FROM public.web_sales_codex_jobs j WHERE j.task_key=CASE task_kind WHEN 'sales' THEN 'web_sales_import' WHEN 'ec_profit' THEN 'ec_profit_import' ELSE 'ad_cost_import' END
    AND j.channel=task_channel AND j.status IN ('queued','running','waiting_for_user') AND j.id<>NEW.id
    AND daterange(j.period_start,j.period_end,'[]') && daterange(NEW.period_start,NEW.period_end,'[]')) THEN
    RAISE EXCEPTION 'finance_acquisition_already_active';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_finance_acquisition_overlap() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER finance_api_overlap BEFORE INSERT OR UPDATE OF status,period_start,period_end ON public.web_sales_acquisition_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_acquisition_overlap();
CREATE TRIGGER finance_bridge_overlap BEFORE INSERT OR UPDATE OF status,period_start,period_end ON public.web_sales_codex_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_acquisition_overlap();
