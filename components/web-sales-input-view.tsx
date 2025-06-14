const load = async (ym: string) => {
  setLoading(true);
  try {
    const target_month = `${ym}-01`;
    const { data, error } = await supabase.rpc("web_sales_full_month", {
      target_month,
    });
    if (error) throw error;

    const mapped: Row[] = (data as any[] | null | undefined)?.map((r) => ({
      id: r.id ?? null,
      product_id: r.product_id,
      product_name: r.product_name,
      series_name: r.series_name,
      price: r.price ?? 0,
      amazon_count: Number(r.amazon_count) || 0,
      rakuten_count: Number(r.rakuten_count) || 0,
      yahoo_count: Number(r.yahoo_count) || 0,
      mercari_count: Number(r.mercari_count) || 0,
      base_count: Number(r.base_count) || 0,
      qoo10_count: Number(r.qoo10_count) || 0,
    })) ?? [];
    setRows(mapped);
  } catch (e: any) {
    alert(e.message ?? e);
    setRows([]);
  } finally {
    setLoading(false);
  }
};
