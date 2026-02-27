// /app/api/excel-to-pdf/serve/route.ts
// 生成されたPDFファイルをブラウザに配信するAPI
import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

const RECIPE_DIR = 'C:\\作業用\\レシピ'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const folder = searchParams.get('folder')
    const file = searchParams.get('file')

    if (!folder || !file) {
        return NextResponse.json({ error: 'folder and file are required' }, { status: 400 })
    }

    // パストラバーサル防止
    if (folder.includes('..') || file.includes('..')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const filePath = path.join(RECIPE_DIR, folder, file)
    if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${encodeURIComponent(file)}"`,
        },
    })
}
