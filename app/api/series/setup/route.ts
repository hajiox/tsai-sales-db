// app/api/series/setup/route.ts
// seriesマスターテーブル作成 + 初期データ投入

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // テーブル作成
        await client.query(`
      CREATE TABLE IF NOT EXISTS series (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        code INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

        // RLSポリシー
        await client.query(`
      ALTER TABLE series ENABLE ROW LEVEL SECURITY;
    `);

        // ポリシーが既にあれば削除して再作成
        await client.query(`
      DROP POLICY IF EXISTS "Allow select for anon" ON series;
      CREATE POLICY "Allow select for anon" ON series FOR SELECT USING (true);
    `);
        await client.query(`
      DROP POLICY IF EXISTS "Allow all for service_role" ON series;
      CREATE POLICY "Allow all for service_role" ON series FOR ALL USING (true);
    `);

        // 既存データ確認
        const { rows: existing } = await client.query('SELECT COUNT(*) as cnt FROM series');
        if (parseInt(existing[0].cnt) > 0) {
            await client.query('COMMIT');
            return NextResponse.json({ success: true, message: `テーブルは既に存在します (${existing[0].cnt}件)` });
        }

        // 初期データ投入
        const seriesData = [
            [1, '本格チャーシュー'],
            [2, 'レトルトチャーシュー'],
            [3, 'パーフェクトラーメン喜多方'],
            [4, 'パーフェクトラーメンSIO'],
            [5, 'パーフェクトラーメンBUTA'],
            [6, 'パーフェクトラーメンIE-K'],
            [7, '特濃つけ麺'],
            [8, '冷やし中華'],
            [9, '麺のみ'],
            [10, '辛杉家の憂鬱'],
            [11, '会津ソースカツ丼'],
            [12, 'ドレッシング'],
            [13, '福島の桃'],
            [14, '馬肉物語'],
            [15, 'ご飯のお供'],
            [16, 'AIZU CAMPFOOD'],
            [17, '会津の馬刺し'],
            [18, 'その他会津の食'],
            [19, '国産チャーシュー'],
            [20, 'パーフェクトラーメン辛味噌'],
            [21, 'ラーメン背脂'],
            [22, '【単品】'],
            [23, 'パーフェクトラーメン背脂喜多方'],
            [24, '悪魔カレー'],
            [25, '単品'],
            [99, '終売商品'],
        ];

        for (const [code, name] of seriesData) {
            await client.query('INSERT INTO series (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [code, name]);
        }

        await client.query('COMMIT');
        return NextResponse.json({ success: true, message: `seriesテーブル作成 + ${seriesData.length}件投入完了` });
    } catch (error: any) {
        await client.query('ROLLBACK');
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
