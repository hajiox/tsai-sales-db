
import { NextResponse } from 'next/server';
import { getKpiSummary } from '@/app/kpi/actions';

export async function GET() {
    try {
        const fy = 2026;
        const summary = await getKpiSummary(fy);

        // Serialize with indentation
        return new NextResponse(JSON.stringify(summary, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message, stack: error.stack }), {
            status: 500
        });
    }
}
