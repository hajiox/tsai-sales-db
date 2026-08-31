DO $recipe_sns_claim_repair$
DECLARE
  v_definition text;
  v_v1_compact text := $guard$capabilities->>'recipeSnsProtocolVersion' = '1'$guard$;
  v_v2_compact text := $guard$capabilities->>'recipeSnsProtocolVersion' = '2'$guard$;
  v_v3_compact text := $guard$capabilities->>'recipeSnsProtocolVersion' = '3'$guard$;
  v_v1_deparsed text := $guard$capabilities ->> 'recipeSnsProtocolVersion'::text) = '1'::text$guard$;
  v_v2_deparsed text := $guard$capabilities ->> 'recipeSnsProtocolVersion'::text) = '2'::text$guard$;
  v_v3_deparsed text := $guard$capabilities ->> 'recipeSnsProtocolVersion'::text) = '3'::text$guard$;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
    INTO v_definition;

  IF position(v_v3_compact IN v_definition) > 0
     OR position(v_v3_deparsed IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_v1_compact IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_v1_compact, v_v3_compact);
  ELSIF position(v_v2_compact IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_v2_compact, v_v3_compact);
  ELSIF position(v_v1_deparsed IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_v1_deparsed, v_v3_deparsed);
  ELSIF position(v_v2_deparsed IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_v2_deparsed, v_v3_deparsed);
  ELSE
    RAISE EXCEPTION 'recipeSnsProtocolVersion v1/v2 guard was not found';
  END IF;

  IF position(v_v3_compact IN v_definition) = 0
     AND position(v_v3_deparsed IN v_definition) = 0 THEN
    RAISE EXCEPTION 'recipeSnsProtocolVersion v3 guard could not be produced';
  END IF;

  EXECUTE v_definition;
END
$recipe_sns_claim_repair$;

COMMENT ON FUNCTION public.claim_web_sales_codex_job(text, integer) IS
  'Claims jobs only when the worker advertises the task-specific protocol. Recipe SNS generation requires protocol v3; repaired after a later migration restored a stale v1 definition.';
