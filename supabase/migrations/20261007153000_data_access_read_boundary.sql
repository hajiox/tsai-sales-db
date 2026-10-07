-- Close raw data access around the scoped gateway while preserving the existing admin UI.
-- NextAuth JWTs intentionally have an email and authenticated role but no sub claim.
REVOKE SELECT ON TABLE public.recipes, public.recipe_items, public.ingredients, public.materials, public.expenses, public.recipe_reviews, public.web_sales_summary FROM anon, PUBLIC;

DROP POLICY IF EXISTS anon_select ON public.recipes;
CREATE POLICY anon_select ON public.recipes FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.recipes
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS anon_select ON public.recipe_items;
CREATE POLICY anon_select ON public.recipe_items FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.recipe_items
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS anon_select ON public.ingredients;
CREATE POLICY anon_select ON public.ingredients FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.ingredients
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS anon_select ON public.materials;
CREATE POLICY anon_select ON public.materials FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.materials
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS anon_select ON public.expenses;
CREATE POLICY anon_select ON public.expenses FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.expenses
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS anon_select ON public.web_sales_summary;
CREATE POLICY anon_select ON public.web_sales_summary FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY authenticated_all ON public.web_sales_summary
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
ALTER POLICY "Allow authenticated users to insert" ON public.web_sales_summary
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');

DROP POLICY IF EXISTS data_access_admin_scope ON public.recipes;
CREATE POLICY data_access_admin_scope ON public.recipes AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.recipe_items;
CREATE POLICY data_access_admin_scope ON public.recipe_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.ingredients;
CREATE POLICY data_access_admin_scope ON public.ingredients AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.materials;
CREATE POLICY data_access_admin_scope ON public.materials AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.expenses;
CREATE POLICY data_access_admin_scope ON public.expenses AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.recipe_reviews;
CREATE POLICY data_access_admin_scope ON public.recipe_reviews AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');
DROP POLICY IF EXISTS data_access_admin_scope ON public.web_sales_summary;
CREATE POLICY data_access_admin_scope ON public.web_sales_summary AS RESTRICTIVE FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'aizubrandhall@gmail.com');

-- This SECURITY DEFINER aggregate also reads the protected sales table.
CREATE OR REPLACE FUNCTION public.get_web_sales_monthly(start_date text, end_date text)
RETURNS TABLE(month text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role'
     AND coalesce(lower(auth.jwt()->>'email'), '') <> 'aizubrandhall@gmail.com' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT to_char(s.report_month, 'YYYY-MM-01')::text AS month,
    (CASE WHEN COUNT(*) FILTER (WHERE public.web_sales_reported_total_amount(s) IS NULL) > 0
      THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(s)), 0::numeric)
    END)::numeric AS amount
  FROM public.web_sales_summary s
  JOIN public.products p ON s.product_id = p.id
  WHERE s.report_month >= CAST(start_date AS DATE) AND s.report_month < CAST(end_date AS DATE)
  GROUP BY month;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_web_sales_monthly(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_web_sales_monthly(text,text) TO authenticated, service_role;
