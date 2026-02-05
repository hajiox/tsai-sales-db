
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { addMonths, format, subYears, parseISO, startOfMonth } from 'date-fns';

// 1. Env Loading
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
            }
        });
    }
} catch (e) { console.log('Env load error', e); }

// 2. DB Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: undefined,
});

// 3. Logic
function generateMonths(fy: number): string[] {
    const months: string[] = [];
    const start = new Date(fy - 1, 7, 1); // Aug 1st
    for (let i = 0; i < 12; i++) {
        months.push(format(addMonths(start, i), 'yyyy-MM-01'));
    }
    return months;
}

async function fetchWebSales(start: string, end: string) {
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
    const sql = `
    SELECT 
      to_char(report_month, 'YYYY-MM-01') as month,
      SUM(total_sales) + 
      COALESCE((
        SELECT SUM(adjustment_amount)
        FROM brand_store_sales_adjustments a
        WHERE a.report_month = b.report_month
      ), 0) as amount
    FROM brand_store_sales b
    WHERE report_month >= $1 AND report_month < $2
    GROUP BY report_month
  `;
    const res = await pool.query(sql, [start, end]);
    return res.rows;
}

async function fetchShokuSales(start: string, end: string) {
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

async function getKpiSummary(fiscalYear: number) {
    const fyMonths = generateMonths(fiscalYear);
    const startCurrent = fyMonths[0]; // YYYY-08-01
    const endCurrent = format(addMonths(parseISO(fyMonths[11]), 1), 'yyyy-MM-01');
    const startTwoAgo = format(subYears(parseISO(startCurrent), 2), 'yyyy-MM-01');
    const queryStart = startTwoAgo;
    const queryEnd = endCurrent;

    const [webRows, wholesaleRows, storeRows, shokuRows, targetRows] = await Promise.all([
        fetchWebSales(queryStart, queryEnd),
        fetchWholesaleSales(queryStart, queryEnd),
        fetchStoreSales(queryStart, queryEnd),
        fetchShokuSales(queryStart, queryEnd),
        fetchTargets(queryStart, queryEnd)
    ]);

    const webMap = new Map(webRows.map(r => [r.month, Number(r.amount)]));
    const wholesaleMap = new Map(wholesaleRows.map(r => [r.month, Number(r.amount)]));
    const storeMap = new Map(storeRows.map(r => [r.month, Number(r.amount)]));
    const shokuMap = new Map(shokuRows.map(r => [r.month, Number(r.amount)]));

    const getAmount = (channel: string, month: string) => {
        switch (channel) {
            case 'WEB': return webMap.get(month) || 0;
            case 'WHOLESALE': return wholesaleMap.get(month) || 0;
            case 'STORE': return storeMap.get(month) || 0;
            case 'SHOKU': return shokuMap.get(month) || 0;
            default: return 0;
        }
    };

    const resultChannels: any = {};
    ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'].forEach(channel => {
        resultChannels[channel] = fyMonths.map(month => {
            const actual = getAmount(channel, month);
            return { month, actual };
        });
    });

    return resultChannels;
}

// 4. Main
async function main() {
    try {
        const fy = 2026;
        console.log(`Verifying FY${fy}...`);
        const data = await getKpiSummary(fy);
        console.log('Result (first month):');
        ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'].forEach(c => {
            console.log(`${c}: ${data[c][0].month} = ${data[c][0].actual}`);
        });
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

main();
