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

        // Check recipe exists
        const { data: recipe, error: fetchError } = await supabaseAdmin
            .from('recipes')
            .select('id')
            .eq('id', recipeId)
            .single();

        if (fetchError || !recipe) {
            return NextResponse.json({ error: 'レシピが見つかりません' }, { status: 404 });
        }

        // Get current max sort_order
        const { data: maxOrder } = await supabaseAdmin
            .from('recipe_images')
            .select('sort_order')
            .eq('recipe_id', recipeId)
            .order('sort_order', { ascending: false })
            .limit(1)
            .single();

        const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

        // Upload to Vercel Blob
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `recipe-photos/${recipeId}/${Date.now()}.${ext}`;

        const blob = await put(filename, file, {
            access: 'public',
            addRandomSuffix: true,
        });

        // Insert into recipe_images
        const { data: inserted, error: insertError } = await supabaseAdmin
            .from('recipe_images')
            .insert({
                recipe_id: recipeId,
                image_url: blob.url,
                sort_order: nextOrder,
            })
            .select()
            .single();

        if (insertError) {
            try { await del(blob.url); } catch { }
            return NextResponse.json({ error: 'DB登録に失敗しました' }, { status: 500 });
        }

        // Also update recipes.product_image_url with the first image (for backwards compat)
        const { data: firstImage } = await supabaseAdmin
            .from('recipe_images')
            .select('image_url')
            .eq('recipe_id', recipeId)
            .order('sort_order', { ascending: true })
            .limit(1)
            .single();

        if (firstImage) {
            await supabaseAdmin
                .from('recipes')
                .update({ product_image_url: firstImage.image_url })
                .eq('id', recipeId);
        }

        return NextResponse.json({ id: inserted.id, url: blob.url, sort_order: nextOrder });
    } catch (error: any) {
        console.error('Image upload error:', error);
        return NextResponse.json({ error: error.message || 'アップロードに失敗しました' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { imageId, recipeId } = await request.json();

        if (!imageId) {
            return NextResponse.json({ error: 'imageId が必要です' }, { status: 400 });
        }

        // Get image
        const { data: image, error: fetchError } = await supabaseAdmin
            .from('recipe_images')
            .select('id, recipe_id, image_url')
            .eq('id', imageId)
            .single();

        if (fetchError || !image) {
            return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 });
        }

        // Delete blob
        try {
            await del(image.image_url);
        } catch (e) {
            console.warn('Blob deletion failed:', e);
        }

        // Delete from DB
        await supabaseAdmin
            .from('recipe_images')
            .delete()
            .eq('id', imageId);

        // Update recipes.product_image_url
        const rid = recipeId || image.recipe_id;
        const { data: firstImage } = await supabaseAdmin
            .from('recipe_images')
            .select('image_url')
            .eq('recipe_id', rid)
            .order('sort_order', { ascending: true })
            .limit(1)
            .single();

        await supabaseAdmin
            .from('recipes')
            .update({ product_image_url: firstImage?.image_url || null })
            .eq('id', rid);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Image delete error:', error);
        return NextResponse.json({ error: error.message || '削除に失敗しました' }, { status: 500 });
    }
}

// GET: fetch images for a recipe
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const recipeId = searchParams.get('recipeId');

        if (!recipeId) {
            return NextResponse.json({ error: 'recipeId が必要です' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('recipe_images')
            .select('id, image_url, sort_order, created_at')
            .eq('recipe_id', recipeId)
            .order('sort_order', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ images: data || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
