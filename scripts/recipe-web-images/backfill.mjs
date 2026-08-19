import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(process.cwd(), 'tmp', 'recipe-web-images');
const IMAGE_TMP_DIR = path.join(os.tmpdir(), 'tsa-recipe-web-images');
const MAX_IMAGES_PER_PRODUCT = 12;
const PYTHON = process.env.CODEX_WORKSPACE_PYTHON
  || 'C:\\Users\\ts\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const APP_URL = process.env.TSA_APP_URL || 'https://v0-tsa-19.vercel.app';
const APPLY = process.argv.includes('--apply');

const rakutenHome = 'https://item.rakuten.co.jp/aizubrandhall/';
const baseHome = 'https://www.aizubrandhall-ec.com/';

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeName(value = '') {
  return decodeHtml(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/【(?:ネット|web|楽天|base|自社|冷凍|冷蔵)】/gi, '')
    .replace(/\b(?:送料無料|送料込|お取り寄せ|会津ブランド館|会津の|自家製)\b/gi, '')
    .replace(/[\s\u3000・･,，.。/／\\|｜()（）\[\]［］「」『』【】!！?？~〜～ー－_：:]+/g, '')
    .trim();
}

function bigrams(value) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function similarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.25 + 0.72;
  const aa = bigrams(a);
  const bb = bigrams(b);
  let shared = 0;
  for (const token of aa) if (bb.has(token)) shared++;
  return (2 * shared) / (aa.size + bb.size);
}

function numericTokens(value = '') {
  return [...normalizeName(value).matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]);
}

function quantitiesAgree(recipeNames, productTitle) {
  const expected = unique(recipeNames.flatMap(numericTokens));
  if (expected.length === 0) return true;
  const actual = new Set(numericTokens(productTitle));
  return expected.every((value) => actual.has(value));
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36',
      'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const contentType = response.headers.get('content-type') || '';
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1]?.replace(/["']/g, '') || 'utf-8';
  return new TextDecoder(charset).decode(await response.arrayBuffer());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function rakutenImageKey(url) {
  try {
    return new URL(url).pathname.replace(/^\/aizubrandhall\//i, '/').toLowerCase();
  } catch {
    return url;
  }
}

function uniqueRakutenImages(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const key = rakutenImageKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function absoluteUrl(url, base) {
  try {
    return new URL(decodeHtml(url), base).href;
  } catch {
    return null;
  }
}

async function crawlRakuten() {
  const homeHtml = await fetchText(rakutenHome);
  const categories = unique([...homeHtml.matchAll(/href=["']([^"']*item\.rakuten\.co\.jp\/aizubrandhall\/c\/[^"'#?]+)["']/gi)]
    .map((match) => absoluteUrl(match[1], rakutenHome)));
  const pages = [homeHtml];
  for (const url of categories) {
    try { pages.push(await fetchText(url)); } catch (error) { console.warn(`Rakuten category skipped: ${error.message}`); }
  }
  const productUrls = unique(pages.flatMap((html) => [...html.matchAll(/href=["']([^"']*item\.rakuten\.co\.jp\/aizubrandhall\/(?!c\/)[^"'#?]+)["']/gi)]
    .map((match) => absoluteUrl(match[1], rakutenHome))))
    .filter((url) => /^https:\/\/item\.rakuten\.co\.jp\/aizubrandhall\/[^/]+\/?$/i.test(url));

  const products = [];
  for (const pageUrl of productUrls) {
    try {
      const html = await fetchText(pageUrl);
      const title = decodeHtml((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
        || html.match(/<title>([^<]+)/i) || [])[1] || '');
      const metaImages = [...html.matchAll(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)/gi)]
        .map((match) => absoluteUrl(match[1], pageUrl));
      const galleryImages = [...html.matchAll(/<img[^>]+(?:src|data-src)=["'](https:\/\/image\.rakuten\.co\.jp\/aizubrandhall\/cabinet\/[^"']+)["'][^>]*alt=["']商品画像\d*/gi)]
        .map((match) => absoluteUrl(match[1], pageUrl));
      const images = uniqueRakutenImages(unique([...metaImages, ...galleryImages])
        .map((url) => url.replace(/\?[^#]*$/, ''))
      ).slice(0, MAX_IMAGES_PER_PRODUCT);
      const slug = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1) || '';
      if (title && images.length) products.push({ source: 'rakuten', pageUrl, slug, title, images });
    } catch (error) {
      console.warn(`Rakuten product skipped: ${error.message}`);
    }
  }
  return products;
}

async function crawlBase() {
  const homeHtml = await fetchText(baseHome);
  const itemUrls = unique([...homeHtml.matchAll(/href=["']([^"']*\/items\/\d+)["']/gi)]
    .map((match) => absoluteUrl(match[1], baseHome)));
  const products = [];
  for (const pageUrl of itemUrls) {
    try {
      const html = await fetchText(pageUrl);
      const title = decodeHtml((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
        || html.match(/<title>([^<]+)/i) || [])[1] || '');
      const images = unique([...html.matchAll(/https:\/\/baseec-img-mng\.akamaized\.net\/images\/item\/origin\/[^"'<>\s?]+/gi)]
        .map((match) => match[0]))
        .slice(0, MAX_IMAGES_PER_PRODUCT);
      if (title && images.length) products.push({ source: 'base', pageUrl, slug: '', title, images });
    } catch (error) {
      console.warn(`BASE product skipped: ${error.message}`);
    }
  }
  return products;
}

function chooseMatch(recipe, products) {
  const jan = String(recipe.jan_code || '').replace(/\D/g, '');
  const names = recipe.category === '自社'
    ? [recipe.name]
    : [recipe.name, recipe.ec_product_name].filter(Boolean);
  const ranked = products.map((product) => {
    const directJan = jan.length >= 8 && product.slug.replace(/\D/g, '') === jan;
    const score = Math.max(...names.map((name) => similarity(name, product.title)), 0);
    return { product, score: directJan ? 1.1 : score, reason: directJan ? 'jan' : 'name' };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return { status: 'unmatched', candidates: [] };
  const margin = best.score - (second?.score || 0);
  const nameIsSafe = quantitiesAgree(names, best.product.title)
    && ((best.score >= 0.72 && margin >= 0.15)
      || (best.score >= 0.82 && margin >= 0.05)
      || (recipe.category === '自社' && best.score >= 0.5 && margin >= 0.25));
  const safe = best.reason === 'jan' || nameIsSafe;
  return {
    status: safe ? 'matched' : 'review',
    match: safe ? best : null,
    candidates: ranked.slice(0, 3).map(({ product, score, reason }) => ({ title: product.title, pageUrl: product.pageUrl, score, reason })),
  };
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), 60000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(stderr || `Python exited ${code}`));
    });
  });
}

async function downloadAndCompress(url, fileStem) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { Referer: new URL(url).origin, 'User-Agent': 'Mozilla/5.0' },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const extension = (response.headers.get('content-type') || '').includes('png') ? '.png' : '.jpg';
  const sourcePath = path.join(IMAGE_TMP_DIR, `${fileStem}-source${extension}`);
  const outputPath = path.join(IMAGE_TMP_DIR, `${fileStem}.webp`);
  await fs.mkdir(IMAGE_TMP_DIR, { recursive: true });
  await fs.writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
  await runPython([path.join(__dirname, 'compress_image.py'), sourcePath, outputPath]);
  await fs.rm(sourcePath, { force: true }).catch(() => undefined);
  return outputPath;
}

async function uploadImage(recipe, product, sourceUrl, index) {
  let filePath;
  try {
    filePath = await downloadAndCompress(sourceUrl, `${recipe.id}-${index + 1}`);
  } catch (error) {
    if (error.message.includes('SKIP_NON_PRODUCT_IMAGE')) return { status: 'skipped' };
    throw error;
  }
  const buffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('file', new File([buffer], `${recipe.id}-${index + 1}.webp`, { type: 'image/webp' }));
  formData.append('recipeId', recipe.id);
  formData.append('sourceType', product.source);
  formData.append('sourcePageUrl', product.pageUrl);
  formData.append('sourceImageUrl', sourceUrl);
  formData.append('originalFilename', path.basename(new URL(sourceUrl).pathname));
  const response = await fetch(`${APP_URL}/api/recipe/web-images`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409) return { status: 'duplicate' };
  if (!response.ok) throw new Error(payload.error || `${response.status} upload failed`);
  return { status: 'uploaded', bytes: buffer.length };
}

async function getExistingSourceUrls(recipeId) {
  const response = await fetch(`${APP_URL}/api/recipe/web-images?recipeId=${recipeId}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) return new Set();
  const payload = await response.json();
  return new Set((payload.images || []).map((image) => image.source_image_url).filter(Boolean));
}

async function runInChunks(items, chunkSize, worker) {
  const results = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    results.push(...await Promise.all(items.slice(index, index + chunkSize).map(worker)));
  }
  return results;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(IMAGE_TMP_DIR, { recursive: true });
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows: recipes } = await client.query(`
    SELECT id, name, category, jan_code, ec_product_name
    FROM recipes
    WHERE category = ANY($1::text[])
    ORDER BY category, name
  `, [['ネット専用', '自社']]);
  await client.end();

  console.log('Crawling official shops...');
  const [rakutenProducts, baseProducts] = await Promise.all([crawlRakuten(), crawlBase()]);
  console.log(`Rakuten ${rakutenProducts.length} / BASE ${baseProducts.length}`);

  const report = [];
  for (const recipe of recipes) {
    const products = recipe.category === 'ネット専用'
      ? rakutenProducts
      : baseProducts.filter((product) => product.title.includes('単品'));
    const decision = chooseMatch(recipe, products);
    report.push({
      recipeId: recipe.id,
      recipeName: recipe.name,
      category: recipe.category,
      janCode: recipe.jan_code,
      ecProductName: recipe.ec_product_name,
      status: decision.status,
      selected: decision.match ? {
        title: decision.match.product.title,
        pageUrl: decision.match.product.pageUrl,
        score: decision.match.score,
        reason: decision.match.reason,
        imageCount: decision.match.product.images.length,
      } : null,
      candidates: decision.candidates,
      uploads: [],
    });
  }

  await fs.writeFile(path.join(OUT_DIR, 'match-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rakutenProducts: rakutenProducts.length, baseProducts: baseProducts.length, recipes: report }, null, 2));
  const matched = report.filter((item) => item.status === 'matched');
  console.log(`Matched ${matched.length}/${report.length}. Report: ${path.join(OUT_DIR, 'match-report.json')}`);

  if (!APPLY) return;
  for (const item of matched) {
    const product = [...rakutenProducts, ...baseProducts].find((entry) => entry.pageUrl === item.selected.pageUrl);
    const recipe = recipes.find((entry) => entry.id === item.recipeId);
    const existingSourceUrls = await getExistingSourceUrls(recipe.id);
    const pendingImages = product.images
      .map((sourceUrl, index) => ({ sourceUrl, index }))
      .filter(({ sourceUrl }) => !existingSourceUrls.has(sourceUrl));
    const alreadyRegistered = product.images.length - pendingImages.length;
    if (alreadyRegistered) console.log(`${item.recipeName}: ${alreadyRegistered}枚は登録済み`);
    await runInChunks(pendingImages, 4, async ({ sourceUrl, index }) => {
      try {
        const result = await uploadImage(recipe, product, sourceUrl, index);
        item.uploads.push({ sourceUrl, ...result });
        console.log(`${item.recipeName} ${index + 1}/${product.images.length}: ${result.status}`);
      } catch (error) {
        item.uploads.push({ sourceUrl, status: 'failed', error: error.message });
        console.error(`${item.recipeName}: ${error.message}`);
      }
    });
    await fs.writeFile(path.join(OUT_DIR, 'match-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rakutenProducts: rakutenProducts.length, baseProducts: baseProducts.length, recipes: report }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
