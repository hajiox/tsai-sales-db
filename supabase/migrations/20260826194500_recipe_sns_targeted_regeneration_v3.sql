DO $recipe_sns_v3$
DECLARE
  v_definition text;
  v_old text := $old$worker.capabilities->>'recipeSnsProtocolVersion' = '2'$old$;
  v_new text := $new$worker.capabilities->>'recipeSnsProtocolVersion' = '3'$new$;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
    INTO v_definition;
  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'recipeSnsProtocolVersion v2 guard was not found';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END
$recipe_sns_v3$;

COMMENT ON FUNCTION public.claim_web_sales_codex_job(text, integer) IS
  'Claims jobs only when the worker advertises the task-specific protocol. Recipe SNS targeted regeneration requires protocol v3.';
