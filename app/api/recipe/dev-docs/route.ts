import { NextResponse } from 'next/server';
import { listDriveFiles, readDriveFileByName, uploadDriveFile } from '@/lib/google-drive';
import { requireRecipeAdminRequest } from '@/lib/recipe-request-auth';

export async function GET(request: Request) {
    const authError = await requireRecipeAdminRequest(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');
    try {
        if (fileName) {
            const content = await readDriveFileByName(fileName);
            if (content === null) {
                return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
            }
            return NextResponse.json({ fileName, content });
        } else {
            const files = await listDriveFiles();
            return NextResponse.json({ files });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const authError = await requireRecipeAdminRequest(request);
    if (authError) return authError;

    try {
        const { fileName, content } = await request.json();
        if (!fileName || !content) {
            return NextResponse.json({ error: 'fileName と content が必要です' }, { status: 400 });
        }
        const fileId = await uploadDriveFile(fileName, content);
        return NextResponse.json({ success: true, fileId });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
