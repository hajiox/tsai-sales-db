const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260902130000_backfill_recipe_item_master_links.sql",
);

async function inspectCandidates(client) {
  const result = await client.query(`
    WITH unique_ingredient_names AS (
      SELECT btrim(name) AS name_key
      FROM public.ingredients
      WHERE btrim(name) <> ''
      GROUP BY btrim(name)
      HAVING count(*) = 1
    ), unique_material_names AS (
      SELECT btrim(name) AS name_key
      FROM public.materials
      WHERE btrim(name) <> ''
      GROUP BY btrim(name)
      HAVING count(*) = 1
    )
    SELECT
      count(*) FILTER (
        WHERE recipe_item.item_type = 'ingredient'
          AND recipe_item.ingredient_id IS NULL
          AND unique_ingredient.name_key IS NOT NULL
      )::integer AS ingredient_rows,
      count(*) FILTER (
        WHERE recipe_item.item_type = 'material'
          AND recipe_item.material_id IS NULL
          AND unique_material.name_key IS NOT NULL
      )::integer AS material_rows
    FROM public.recipe_items AS recipe_item
    LEFT JOIN unique_ingredient_names AS unique_ingredient
      ON unique_ingredient.name_key = btrim(recipe_item.item_name)
    LEFT JOIN unique_material_names AS unique_material
      ON unique_material.name_key = btrim(recipe_item.item_name)
  `);
  return result.rows[0];
}

async function verify(client) {
  const remaining = await inspectCandidates(client);
  if (Number(remaining.ingredient_rows) !== 0 || Number(remaining.material_rows) !== 0) {
    throw new Error(`Exact master links remain unresolved: ${JSON.stringify(remaining)}`);
  }
  return { remainingIngredientRows: 0, remainingMaterialRows: 0 };
}

async function main() {
  const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", ".env.local");
  require("dotenv").config({ path: envPath, quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log(JSON.stringify(await inspectCandidates(client)));
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { inspectCandidates, migrationPath, verify };
