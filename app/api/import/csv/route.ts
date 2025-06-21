// /app/api/import/csv/route.ts
// ver.7 (マッチングロジック改善版)
// 一時的な商品マッチング関数（改善版）
async function matchProductsByName(productNames: string[]) {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, series, price');

  if (error) {
    throw new Error(`商品マスタの取得に失敗しました: ${error.message}`);
  }

  return productNames.map(csvName => {
    // 1. 完全一致を最優先
    let match = products?.find(p => p.name === csvName);
    
    if (!match) {
      // 2. 部分一致（CSVの商品名がマスタ商品名を含む）- より長い商品名を優先
      const partialMatches = products?.filter(p => csvName.includes(p.name)) || [];
      if (partialMatches.length > 0) {
        // 商品名の長い順にソートして、最も具体的なものを選択
        match = partialMatches.sort((a, b) => b.name.length - a.name.length)[0];
      }
    }
    
    if (!match) {
      // 3. 部分一致（マスタ商品名がCSVの商品名を含む）
      match = products?.find(p => p.name.includes(csvName));
    }
    
    return match ? {
      id: match.id,
      name: match.name,
      series: match.series,
      price: match.price,
      similarity: match.name === csvName ? 1.0 : 0.8 // 完全一致は1.0、部分一致は0.8
    } : null;
  });
}
