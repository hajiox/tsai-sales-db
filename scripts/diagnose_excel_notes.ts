
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zrerpexdsaxqztqqrwwv.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";

const supabase = createClient(supabaseUrl, supabaseKey);
const RECIPE_DIR = 'C:/Users/ts/OneDrive/Desktop/作業用/レシピ';

async function diagnose() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    const filePath = path.join(RECIPE_DIR, '【重要】【製造】総合管理（新型）ネット専用.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = '【OB】トマト味噌';
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        log(`Sheet not found: ${sheetName}`);
        return;
    }

    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    log(`Scanning sheet: ${sheetName} (Size: ${jsonData.length} rows)`);

    for (let r = 0; r < Math.min(jsonData.length, 100); r++) {
        const row = jsonData[r];
        for (let c = 0; c < Math.min(row.length, 30); c++) {
            const val = String(row[c]).trim();
            if (val && val !== '') {
                log(`Row ${r + 1}, Col ${c}: "${val}"`);
            }
        }
    }
    fs.writeFileSync('scripts/diagnose_output.txt', output);
}

diagnose();
