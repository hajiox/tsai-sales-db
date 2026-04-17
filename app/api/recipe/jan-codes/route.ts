import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body = await request.json();
        const { product_name, category, price_excl_tax, ingredients, memo } = body;

        let company_prefix = "457131862"; // default 物品
        if (category === "食品") {
            company_prefix = "457131863"; // 食品
        }

        // Get max item code
        const { data, error } = await supabase
            .from("jan_codes")
            .select("item_code")
            .eq("company_prefix", company_prefix)
            .order("item_code", { ascending: false })
            .limit(1);

        if (error) {
            console.error("DB Error:", error);
        }

        let nextItemCodeNo = 1;
        if (data && data.length > 0 && data[0].item_code) {
            nextItemCodeNo = parseInt(data[0].item_code, 10) + 1;
        }

        const nextItemCode = String(nextItemCodeNo).padStart(3, '0');
        const codePrefix = company_prefix + nextItemCode;

        let oddSum = 0;
        let evenSum = 0;
        for (let i = 0; i < 12; i++) {
            const num = parseInt(codePrefix[i], 10);
            if (i % 2 === 0) {
                oddSum += num;
            } else {
                evenSum += num;
            }
        }
        const sum = oddSum + evenSum * 3;
        const mod = sum % 10;
        const checkDigit = mod === 0 ? "0" : String(10 - mod);
        
        const jan_code = codePrefix + checkDigit;

        const insertData = {
            jan_code,
            company_prefix,
            item_code: nextItemCode,
            check_digit: checkDigit,
            product_name: product_name || "新規登録商品",
            category: category || "物品",
            price_excl_tax: price_excl_tax ? Number(price_excl_tax) : null,
            ingredients: ingredients || null,
            memo: memo || null,
        };

        const { data: newRow, error: insertError } = await supabase
            .from("jan_codes")
            .insert(insertData)
            .select()
            .single();

        if (insertError) throw insertError;

        return NextResponse.json({ success: true, data: newRow });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
