
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'kpi_manual_entries_v1'
    `);
        return NextResponse.json({ tables: res.rows });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
