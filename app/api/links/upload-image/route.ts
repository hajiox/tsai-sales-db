// /app/api/links/upload-image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET_NAME = 'link-images'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json(
                { error: 'ファイルがありません' },
                { status: 400 }
            )
        }

        // ファイル名をユニークに
        const timestamp = Date.now()
        const ext = file.name.split('.').pop() || 'png'
        const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`

        // ファイルをバッファに変換
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Supabase Storageにアップロード
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: false,
            })

        if (error) {
            console.error('Upload error:', error)
            // バケットが存在しない場合は作成を試みる
            if (error.message.includes('not found')) {
                return NextResponse.json(
                    { error: `ストレージバケット "${BUCKET_NAME}" が見つかりません。Supabaseダッシュボードで作成してください。` },
                    { status: 500 }
                )
            }
            return NextResponse.json(
                { error: 'アップロードに失敗しました: ' + error.message },
                { status: 500 }
            )
        }

        // 公開URLを取得
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fileName)

        return NextResponse.json({
            success: true,
            url: urlData.publicUrl,
        })
    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json(
            { error: 'アップロード処理中にエラーが発生しました' },
            { status: 500 }
        )
    }
}
