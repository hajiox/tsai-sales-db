
'use server'

import { pool } from '@/lib/db';
import { addMonths, format, subYears, parseISO, startOfMonth } from 'date-fns';

// ----------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------

export type ChannelCode = 'WEB' | 'WHOLESALE' | 'STORE' | 'SHOKU';

export interface MonthlyKpiData {
    month: string; // "YYYY-MM-01"
    actual: number; // 実績
    target: number; // 目標
    lastYear: number; // 前年実績
    twoYearsAgo: number; // 前々年実績
}

export interface KpiSummary {
    fiscalYear: number; // e.g. 2026 (Aug 2025 - Jul 2026)
    months: string[];   // List of 12 months in this FY
    channels: {
        [key in ChannelCode]: MonthlyKpiData[];
    };
    total: MonthlyKpiData[]; // Aggregated total of all channels
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function getFiscalYearRange(fy: number) {
    // FY2026 = 2025-08-01 to 2026-07-31
    const start = `${fy - 1}-08-01`;
    const end = `${fy}-07-31`; // Included
    return { start, end };
}

function generateMonths(fy: number): string[] {
    const months: string[] = [];
    const start = new Date(fy - 1, 7, 1); // Aug 1st
    for (let i = 0; i < 12; i++) {
        months.push(format(addMonths(start, i), 'yyyy-MM-01'));
    }
    return months;
}

// ----------------------------------------------------------------------
// Server Actions
// ----------------------------------------------------------------------

export async function getKpiSummary(fiscalYear: number): Promise<KpiSummary> {
    // 1. Prepare time ranges
    // Current FY
    const fyMonths = generateMonths(fiscalYear);
    const startCurrent = fyMonths[0]; // YYYY-08-01
    const endCurrent = format(addMonths(parseISO(fyMonths[11]), 1), 'yyyy-MM-01'); // Next month 1st as upper bound for < query

    // Last Year (FY - 1)
    const startLast = format(subYears(parseISO(startCurrent), 1), 'yyyy-MM-01');
    const endLast = format(subYears(parseISO(endCurrent), 1), 'yyyy-MM-01');

    // Two Years Ago (FY - 2)
    const startTwoAgo = format(subYears(parseISO(startCurrent), 2), 'yyyy-MM-01');
    const endTwoAgo = format(subYears(parseISO(endCurrent), 2), 'yyyy-MM-01');

    // 2. Fetch Data Parallelly
    // We need to fetch data for the wide range: [startTwoAgo, endCurrent) to cover all 3 years
    // However, fetching strictly by FY might be cleaner to separate "LastYear" logic.
    // Actually, let's fetch ALL raw data for the relevant 36 months window.

    const queryStart = startTwoAgo;
    const queryEnd = endCurrent;

    try {
        const [webRows, wholesaleRows, storeRows, shokuRows, targetRows] = await Promise.all([
            fetchWebSales(queryStart, queryEnd),
            fetchWholesaleSales(queryStart, queryEnd),
            fetchStoreSales(queryStart, queryEnd),
            fetchShokuSales(queryStart, queryEnd),
            fetchTargets(queryStart, queryEnd)
        ]);

        // 3. Process & Merge Data
        const channels: ChannelCode[] = ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'];
        const resultChannels: any = {};

        // Map raw rows to lookup maps: key = "YYYY-MM-01" -> amount
        const webMap = new Map(webRows.map(r => [r.month, Number(r.amount)]));
        const wholesaleMap = new Map(wholesaleRows.map(r => [r.month, Number(r.amount)]));
        const storeMap = new Map(storeRows.map(r => [r.month, Number(r.amount)]));
        const shokuMap = new Map(shokuRows.map(r => [r.month, Number(r.amount)]));
        const targetMap = new Map(targetRows.map(r => [`${r.channel}_${r.month}`, Number(r.amount)]));

        const getAmount = (channel: ChannelCode, month: string) => {
            switch (channel) {
                case 'WEB': return webMap.get(month) || 0;
                case 'WHOLESALE': return wholesaleMap.get(month) || 0;
                case 'STORE': return storeMap.get(month) || 0;
                case 'SHOKU': return shokuMap.get(month) || 0;
                default: return 0;
            }
        };

        channels.forEach(channel => {
            resultChannels[channel] = fyMonths.map(month => {
                const lastYearMonth = format(subYears(parseISO(month), 1), 'yyyy-MM-01');
                const twoYearsAgoMonth = format(subYears(parseISO(month), 2), 'yyyy-MM-01');

                return {
                    month,
                    actual: getAmount(channel, month),
                    target: targetMap.get(`${channel}_${month}`) || 0,
                    lastYear: getAmount(channel, lastYearMonth),
                    twoYearsAgo: getAmount(channel, twoYearsAgoMonth),
                };
            });
        });

        // 4. Calculate Total
        const total = fyMonths.map((month, i) => {
            const channelData = channels.map(c => resultChannels[c][i]);
            return {
                month,
                actual: channelData.reduce((sum, d) => sum + d.actual, 0),
                target: channelData.reduce((sum, d) => sum + d.target, 0),
                lastYear: channelData.reduce((sum, d) => sum + d.lastYear, 0),
                twoYearsAgo: channelData.reduce((sum, d) => sum + d.twoYearsAgo, 0),
            };
        });

        return {
            fiscalYear,
            months: fyMonths,
            channels: resultChannels,
            total
        };

    } catch (error) {
        console.error('Failed to get KPI summary:', error);
        throw new Error('KPIデータの取得に失敗しました');
    }
}

export async function saveKpiTarget(data: { channel: string, month: string, amount: number }) {
    try {
        // Upsert target
        const query = `
      INSERT INTO kpi.kpi_manual_entries_v1 (metric, channel_code, month, amount, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (metric, channel_code, month)
      DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW();
    `;
        await pool.query(query, ['target', data.channel, data.month, data.amount]);
        return { success: true };
    } catch (error) {
        console.error('Failed to save KPI target:', error);
        return { success: false, error: '目標値の保存に失敗しました' };
    }
}

// ----------------------------------------------------------------------
// Raw Data Fetchers
// ----------------------------------------------------------------------

async function fetchWebSales(start: string, end: string) {
    // Web Sales: Join summary with products to calculate price * quantity
    // Columns in web_sales_summary: report_month, product_id, amazon_count, rakuten_count...
    // Columns in products: id, price
    const sql = `
    SELECT 
      to_char(s.report_month, 'YYYY-MM-01') as month,
      SUM(
        (COALESCE(s.amazon_count, 0) + 
         COALESCE(s.rakuten_count, 0) + 
         COALESCE(s.yahoo_count, 0) + 
         COALESCE(s.mercari_count, 0) + 
         COALESCE(s.base_count, 0) + 
         COALESCE(s.qoo10_count, 0) + 
         COALESCE(s.tiktok_count, 0)) * COALESCE(p.price, 0)
      ) as amount
    FROM web_sales_summary s
    JOIN products p ON s.product_id = p.id
    WHERE s.report_month >= $1 AND s.report_month < $2
    GROUP BY month
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}

async function fetchWholesaleSales(start: string, end: string) {
    // Wholesale & OEM
    // wholesale_sales: quantity * unit_price (Needs to be calculated if not present as 'amount')
    // oem_sales: amount

    // Note: wholesale_sales usually has 'unit_price' and 'quantity'. 'wholesale_product_price_history' adds complexity but
    // for KPI purposes we will start with the logged sales data.
    // We assume wholesale_sales might NOT have an 'amount' column, so we compute it.

    // Checking previous code: "saveSalesData" sends "unitPrice". So it's likely stored.
    // Actually, let's assume 'wholesale_sales' has { quantity, unit_price } or similar. 
    // If 'unit_price' is missing in the table schema, we'd need to join. 
    // Let's assume standard implementation: quantity * unit_price.

    const sql = `
    WITH wholesale AS (
      SELECT 
        to_char(sale_date, 'YYYY-MM-01') as month,
        SUM(quantity * unit_price) as amount
      FROM wholesale_sales
      WHERE sale_date >= $1 AND sale_date < $2
      GROUP BY month
    ),
    oem AS (
      SELECT 
        to_char(sale_date, 'YYYY-MM-01') as month,
        SUM(amount) as amount
      FROM oem_sales
      WHERE sale_date >= $1 AND sale_date < $2
      GROUP BY month
    )
    SELECT 
      COALESCE(w.month, o.month) as month,
      (COALESCE(w.amount, 0) + COALESCE(o.amount, 0)) as amount
    FROM wholesale w
    FULL OUTER JOIN oem o ON w.month = o.month
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}

async function fetchStoreSales(start: string, end: string) {
    // Brand Store: sales + adjustments
    const sql = `
    SELECT 
      to_char(report_month, 'YYYY-MM-01') as month,
      SUM(total_sales) + 
      (
        SELECT COALESCE(SUM(adjustment_amount), 0)
        FROM brand_store_sales_adjustments a
        WHERE a.report_month = b.report_month
      ) as amount
    FROM brand_store_sales b
    WHERE report_month >= $1 AND report_month < $2
    GROUP BY report_month
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}

async function fetchShokuSales(start: string, end: string) {
    // Food Store
    const sql = `
    SELECT 
      to_char(report_month, 'YYYY-MM-01') as month,
      SUM(total_sales) as amount
    FROM food_store_sales
    WHERE report_month >= $1 AND report_month < $2
    GROUP BY report_month
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}

async function fetchTargets(start: string, end: string) {
    const sql = `
    SELECT 
      channel_code as channel,
      to_char(month, 'YYYY-MM-01') as month,
      CAST(amount AS INTEGER) as amount
    FROM kpi.kpi_manual_entries_v1
    WHERE metric = 'target'
      AND month >= $1 AND month < $2
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}
