import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const recipeId = formData.get('recipeId') as string | null;

        if (!file || !recipeId) {
            return NextResponse.json({ error: 'file と recipeId が必要です' }, { status: 400 });
        }

        // Check if recipe exists and get old image URL for cleanup
        const { data: recipe, error: fetchError } = await supabaseAdmin
            .from('recipes')
            .select('id, product_image_url')
            .eq('id', recipeId)
            .single();

        if (fetchError || !recipe) {
            return NextResponse.json({ error: 'レシピが見つかりません' }, { status: 404 });
        }

        // Delete old blob if exists
        if (recipe.product_image_url) {
            try {
                await del(recipe.product_image_url);
            } catch (e) {
                console.warn('Old blob deletion failed (may not exist):', e);
            }
        }

        // Upload to Vercel Blob
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `recipe-photos/${recipeId}.${ext}`;

        const blob = await put(filename, file, {
            access: 'public',
            addRandomSuffix: true,
        });

        // Update recipe with new image URL
        const { error: updateError } = await supabaseAdmin
            .from('recipes')
            .update({ product_image_url: blob.url })
            .eq('id', recipeId);

        if (updateError) {
            // Rollback: delete uploaded blob
            try { await del(blob.url); } catch { }
            return NextResponse.json({ error: 'DB更新に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ url: blob.url });
    } catch (error: any) {
        console.error('Image upload error:', error);
        return NextResponse.json({ error: error.message || 'アップロードに失敗しました' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { recipeId } = await request.json();

        if (!recipeId) {
            return NextResponse.json({ error: 'recipeId が必要です' }, { status: 400 });
        }

        const { data: recipe, error: fetchError } = await supabaseAdmin
            .from('recipes')
            .select('id, product_image_url')
            .eq('id', recipeId)
            .single();

        if (fetchError || !recipe) {
            return NextResponse.json({ error: 'レシピが見つかりません' }, { status: 404 });
        }

        // Delete blob
        if (recipe.product_image_url) {
            try {
                await del(recipe.product_image_url);
            } catch (e) {
                console.warn('Blob deletion failed:', e);
            }
        }

        // Clear URL in DB
        const { error: updateError } = await supabaseAdmin
            .from('recipes')
            .update({ product_image_url: null })
            .eq('id', recipeId);

        if (updateError) {
            return NextResponse.json({ error: 'DB更新に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Image delete error:', error);
        return NextResponse.json({ error: error.message || '削除に失敗しました' }, { status: 500 });
    }
}
