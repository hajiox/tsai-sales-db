// /components/web-sales-editable-table.tsx の handleFileSelect 関数内の変換処理部分のみ修正
// データをCSV商品名ごとにグループ化
const productGroups = new Map<string, any[]>();
importData.forEach((item: any, index: number) => {
  console.log(`データ${index}:`, item);
  if (!item.csvProductName) {
    console.warn(`データ${index}にcsvProductNameがありません:`, item);
    return;
  }
  const key = item.csvProductName;
  if (!productGroups.has(key)) {
    productGroups.set(key, []);
  }
  productGroups.get(key)!.push(item);
});

console.log('グループ化されたデータ:', productGroups);

// グループ化されたデータをImportResult形式に変換
const convertedResults: ImportResult[] = [];
let id = 1;

productGroups.forEach((items, csvProductName) => {
  console.log(`商品「${csvProductName}」の処理開始:`, items);
  
  // 販売データをECサイト別に集計
  const salesData: { [key: string]: number } = {};
  let matchedProductName = null;
  
  items.forEach((item, itemIndex) => {
    console.log(`  アイテム${itemIndex}:`, item);
    console.log(`  数量: ${item.quantity}, ECサイト: ${item.ecSite}`);
    
    if (item.quantity && item.quantity > 0) {
      // ECサイト名を日本語に変換
      const ecSiteMap: { [key: string]: string } = {
        'amazon': 'Amazon',
        'rakuten': '楽天',
        'yahoo': 'Yahoo',
        'mercari': 'メルカリ',
        'base': 'BASE', 
        'qoo10': 'Qoo10'
      };
      const displayEcSite = ecSiteMap[item.ecSite] || item.ecSite;
      
      // ★ここが重要：既存の値に加算する
      if (salesData[displayEcSite]) {
        salesData[displayEcSite] += item.quantity;
      } else {
        salesData[displayEcSite] = item.quantity;
      }
      
      console.log(`  販売データ更新: ${displayEcSite} = ${salesData[displayEcSite]}`);
    }
    
    // マッチした商品名を取得（最初の1件から）
    if (item.masterProductName && !matchedProductName) {
      matchedProductName = item.masterProductName;
    }
  });
  
  const result = {
    id: id++,
    original: csvProductName,
    matched: matchedProductName,
    salesData: salesData
  };
  
  console.log(`商品「${csvProductName}」の最終結果:`, result);
  convertedResults.push(result);
});
