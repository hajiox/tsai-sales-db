import process from 'node:process';
import nextEnv from '@next/env';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Client } = pg;
const APP_URL = process.env.TSA_APP_URL || 'https://v0-tsa-19.vercel.app';

function sourceKey(url) {
  try {
    return new URL(url).pathname.replace(/^\/aizubrandhall\//i, '/').toLowerCase();
  } catch {
    return url;
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`
    SELECT id, recipe_id, source_type, source_image_url, file_size_bytes, sort_order, created_at
    FROM recipe_web_images
    WHERE source_type IN ('rakuten', 'base')
    ORDER BY recipe_id, sort_order, created_at
  `);
  await client.end();

  const byRecipe = Map.groupBy(rows, (image) => image.recipe_id);
  let deleted = 0;
  for (const [recipeId, images] of byRecipe) {
    const seen = new Set();
    const deleteIds = [];
    const keep = [];
    for (const image of images) {
      const key = sourceKey(image.source_image_url || image.id);
      const junk = Number(image.file_size_bytes) < 1000;
      if (junk || seen.has(key)) {
        deleteIds.push(image.id);
      } else {
        seen.add(key);
        keep.push(image);
      }
    }
    if (deleteIds.length) {
      const response = await fetch(`${APP_URL}/api/recipe/web-images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, imageIds: deleteIds }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`${recipeId}: cleanup failed ${response.status} ${await response.text()}`);
      deleted += deleteIds.length;
    }
    if (keep.length) {
      const response = await fetch(`${APP_URL}/api/recipe/web-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, imageOrder: keep.map(({ id }) => ({ id })) }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`${recipeId}: reorder failed ${response.status}`);
    }
  }
  console.log(JSON.stringify({ recipes: byRecipe.size, before: rows.length, deleted, after: rows.length - deleted }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
