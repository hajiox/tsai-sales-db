// scripts/check_shipping_cost.mjs
// Excelの「食材総合データベース」シートから送料関連データを抽出し、DB値と照合

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// .env.local から読み込み
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const excelPath = 'C:/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx';

async function main() {
  console.log('=== 送料関連データ照合 ===\n');

  // 1. Excelから食材総合データベースシートを読み取る
  console.log('--- Excel読み取り ---');
  const wb = XLSX.readFile(excelPath);
  console.log('シート名一覧:', wb.SheetNames.join(', '));

  // 食材総合データベースシートを探す
  const dbSheetName = wb.SheetNames.find(n => n.includes('食材総合') || n.includes('資材総合'));
  
  // 全シートで「送料」「平均送料」を含むセルを探す
  console.log('\n--- 全シートから「送料」「平均送料」を検索 ---');
  
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    for (let r = 0; r <= Math.min(range.e.r, 100); r++) {
      for (let c = 0; c <= Math.min(range.e.c, 15); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'string' && (cell.v.includes('送料') || cell.v.includes('平均送料'))) {
          // 周辺のセルも取得
          const values = [];
          for (let cc = 0; cc <= Math.min(range.e.c, 15); cc++) {
            const v = sheet[XLSX.utils.encode_cell({ r, c: cc })];
            values.push(v ? v.v : '');
          }
          console.log(`\n[${sheetName}] 行${r + 1}: ${values.filter(v => v !== '').join(' | ')}`);
        }
      }
    }
  }

  // 食材総合データベース・資材総合データベースの全内容をダンプ
  for (const targetSheet of ['食材総合データベース', '資材総合データベース']) {
    if (!wb.SheetNames.includes(targetSheet)) {
      console.log(`\n⚠ シート「${targetSheet}」が見つかりません`);
      continue;
    }
    
    const sheet = wb.Sheets[targetSheet];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    console.log(`\n--- ${targetSheet} (全${range.e.r + 1}行) ---`);
    
    // 「送料」を含む行を検索
    for (let r = 0; r <= range.e.r; r++) {
      let rowHasShipping = false;
      const rowVals = [];
      for (let c = 0; c <= Math.min(range.e.c, 15); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const v = cell ? cell.v : '';
        rowVals.push(v);
        if (typeof v === 'string' && (v.includes('送料') || v.includes('平均') || v.includes('ヤマト') || v.includes('ネコポス'))) {
          rowHasShipping = true;
        }
      }
      if (rowHasShipping) {
        console.log(`行${r + 1}: ${rowVals.filter(v => v !== '').join(' | ')}`);
      }
    }
  }

  // 2. DBの expenses テーブルから送料関連を取得
  console.log('\n\n--- DB: expenses テーブル（送料関連） ---');
  const { data: expenses, error: expErr } = await supabase
    .from('expenses')
    .select('*')
    .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%');
  
  if (expErr) {
    console.log('Error:', expErr.message);
  } else {
    for (const e of expenses) {
      console.log(`  [expenses] ${e.name} | price=${e.price} | unit_price=${e.unit_price} | unit_quantity=${e.unit_quantity} | tax_included=${e.tax_included}`);
    }
  }

  // 3. DBの materials テーブルから送料関連を取得
  console.log('\n--- DB: materials テーブル（送料関連） ---');
  const { data: materials, error: matErr } = await supabase
    .from('materials')
    .select('*')
    .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%');
  
  if (matErr) {
    console.log('Error:', matErr.message);
  } else {
    for (const m of materials) {
      console.log(`  [materials] ${m.name} | price=${m.price} | unit_price=${m.unit_price} | unit_quantity=${m.unit_quantity} | tax_included=${m.tax_included}`);
    }
  }

  // 4. DBの ingredients テーブルから送料関連を取得  
  console.log('\n--- DB: ingredients テーブル（送料関連） ---');
  const { data: ingredients, error: ingErr } = await supabase
    .from('ingredients')
    .select('*')
    .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%');
  
  if (ingErr) {
    console.log('Error:', ingErr.message);
  } else {
    for (const i of ingredients) {
      console.log(`  [ingredients] ${i.name} | price=${i.price} | unit_price=${i.unit_price} | unit_quantity=${i.unit_quantity} | tax_included=${i.tax_included}`);
    }
  }

  // 5. recipe_items から「送料」を含むアイテムを取得
  console.log('\n--- DB: recipe_items（送料関連アイテム） ---');
  const { data: items, error: itemErr } = await supabase
    .from('recipe_items')
    .select('id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price, source_item_id')
    .or('item_name.ilike.%送料%,item_name.ilike.%平均%,item_name.ilike.%ヤマト%,item_name.ilike.%ネコポス%')
    .limit(50);
  
  if (itemErr) {
    console.log('Error:', itemErr.message);
  } else {
    console.log(`  送料関連アイテム: ${items.length}件`);
    for (const i of items) {
      console.log(`  [recipe_items] ${i.item_name} | type=${i.item_type} | cost=${i.cost} | usage=${i.usage_amount} | unit_qty=${i.unit_quantity} | unit_price=${i.unit_price} | src=${i.source_item_id}`);
    }
  }

  console.log('\n=== 照合完了 ===');
}

main().catch(console.error);
