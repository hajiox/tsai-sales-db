// /api/server-control/route.ts - PM2プロセス制御API
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ポート番号 → PM2プロセス名のマッピング
const PORT_TO_PROCESS: Record<string, string> = {
    '3000': 'shopee-chatbot',
    '3001': 'tsai-sales-db',
    '3003': 'yamato-analytics',
};

function getProcessNameFromUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        const port = parsed.port;
        return PORT_TO_PROCESS[port] || null;
    } catch {
        return null;
    }
}

// GET: ステータス確認
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
    }

    const processName = getProcessNameFromUrl(url);
    if (!processName) {
        return NextResponse.json({ controllable: false, status: 'unknown' });
    }

    try {
        const { stdout } = await execAsync('pm2 jlist', { timeout: 5000 });
        const processes = JSON.parse(stdout);
        const proc = processes.find((p: any) => p.name === processName);

        if (!proc) {
            return NextResponse.json({
                controllable: true,
                processName,
                status: 'stopped',
                pm2Status: 'not_registered',
            });
        }

        // 実際にHTTPアクセスできるかも確認
        let httpAlive = false;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(url, { signal: controller.signal });
            httpAlive = res.ok;
            clearTimeout(timeout);
        } catch {
            httpAlive = false;
        }

        return NextResponse.json({
            controllable: true,
            processName,
            status: proc.pm2_env?.status === 'online' ? (httpAlive ? 'online' : 'starting') : 'stopped',
            pm2Status: proc.pm2_env?.status || 'unknown',
            memory: proc.monit?.memory || 0,
            cpu: proc.monit?.cpu || 0,
            uptime: proc.pm2_env?.pm_uptime || null,
            restarts: proc.pm2_env?.restart_time || 0,
        });
    } catch (error: any) {
        console.error('PM2 status check error:', error);
        return NextResponse.json({
            controllable: true,
            processName,
            status: 'error',
            error: error.message,
        });
    }
}

// POST: 起動/停止
export async function POST(req: Request) {
    try {
        const { url, action } = await req.json();

        if (!url || !action) {
            return NextResponse.json({ error: 'url and action required' }, { status: 400 });
        }

        if (!['start', 'stop'].includes(action)) {
            return NextResponse.json({ error: 'action must be start or stop' }, { status: 400 });
        }

        const processName = getProcessNameFromUrl(url);
        if (!processName) {
            return NextResponse.json({ error: 'Unknown server URL' }, { status: 400 });
        }

        let command: string;
        if (action === 'start') {
            command = `cd /d C:\\作業用 && pm2 start ecosystem.config.js --only ${processName}`;
        } else {
            command = `pm2 stop ${processName}`;
        }

        const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
        console.log(`PM2 ${action} ${processName}:`, stdout);

        // 起動の場合は少し待ってからステータス確認
        if (action === 'start') {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        return NextResponse.json({
            ok: true,
            action,
            processName,
            output: stdout,
        });
    } catch (error: any) {
        console.error('PM2 control error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
