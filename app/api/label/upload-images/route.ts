// app/api/label/upload-images/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface LabelImageEntry {
    type: string;
    url: string;
    uploaded_at: string;
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";

        let ingredientId: string = "";
        let filesToUpload: { base64?: string; file?: File; mimeType: string; type: string }[] = [];

        if (contentType.includes("application/json")) {
            // JSON mode (mobile / base64)
            const body = await request.json();
            ingredientId = body.ingredient_id;
            filesToUpload = (body.files || []).map((f: any) => ({
                base64: f.base64,
                mimeType: f.mimeType || "image/jpeg",
                type: f.type,
            }));
        } else {
            // FormData mode (desktop)
            const formData = await request.formData();
            ingredientId = formData.get("ingredient_id") as string;
            const formFiles = formData.getAll("files") as File[];
            const types = formData.getAll("types") as string[];

            filesToUpload = await Promise.all(
                formFiles.map(async (file, i) => ({
                    file,
                    mimeType: file.type,
                    type: types[i] || "unknown",
                }))
            );
        }

        if (!ingredientId) {
            return NextResponse.json({ error: "ingredient_id が必要です" }, { status: 400 });
        }
        if (!filesToUpload.length) {
            return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get current label_images
        const { data: ingredient, error: fetchError } = await supabase
            .from("ingredients")
            .select("label_images")
            .eq("id", ingredientId)
            .single();

        if (fetchError) {
            return NextResponse.json({ error: "食材が見つかりません" }, { status: 404 });
        }

        const existingImages: LabelImageEntry[] = ingredient?.label_images || [];

        // Upload each file to Vercel Blob
        const newImages: LabelImageEntry[] = [];
        for (const f of filesToUpload) {
            const ext = f.mimeType.includes("png") ? "png" : "jpg";
            const filename = `label-images/${ingredientId}/${f.type}_${Date.now()}.${ext}`;

            let blob;
            if (f.base64) {
                const buffer = Buffer.from(f.base64, "base64");
                blob = await put(filename, buffer, {
                    access: "public",
                    addRandomSuffix: true,
                    contentType: f.mimeType,
                });
            } else if (f.file) {
                blob = await put(filename, f.file, {
                    access: "public",
                    addRandomSuffix: true,
                });
            } else {
                continue;
            }

            // Remove existing image of same type (overwrite)
            const filtered = existingImages.filter(img => img.type !== f.type);
            existingImages.length = 0;
            existingImages.push(...filtered);

            newImages.push({
                type: f.type,
                url: blob.url,
                uploaded_at: new Date().toISOString(),
            });
        }

        // Merge and save
        const finalImages = [...existingImages, ...newImages];

        const { error: updateError } = await supabase
            .from("ingredients")
            .update({ label_images: finalImages })
            .eq("id", ingredientId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            uploaded: newImages.length,
            label_images: finalImages,
        });
    } catch (error: any) {
        console.error("Label Image Upload Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
