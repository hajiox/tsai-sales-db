import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = '\\\\tshdd\\disk\\NEW\\★商品パッケージ★';
const APP_URL = process.env.TSA_APP_URL || 'https://v0-tsa-19.vercel.app';
const PYTHON = process.env.CODEX_WORKSPACE_PYTHON
  || 'C:\\Users\\ts\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const TMP_DIR = path.join(os.tmpdir(), 'tsa-recipe-shared-images');
const MAX_IMAGES = 12;

const folderMappings = [
  ['【ZEROカレー】\\ネット用画像', ['【ネット】ZEROカレー×2', 'ZEROカレー']],
  ['【ドレッシングじゅうねん】\\ネット用画像', ['【ネット】じゅうねんドレッシング3本', '【ネット】業務用じゅうねんドレッシング2本', '会津じゅうねんドレッシング', '会津じゅうねんドレッシング（業務用）']],
  ['【ドレッシングトマト】\\ネット用画像', ['【ネット】トマトドレッシング3本', '【ネット】業務用トマトドレッシング2本', '南会津産トマトドレッシング', '南会津産トマトドレッシング（業務用）']],
  ['【ソースカツ丼ソース】\\ネット用画像', ['【ネット】ソースカツ丼のソース3本', '【ネット】ソースカツ丼のソース5本', '【ネット】会津ソースカツ丼のソース業務用2本', '会津ソースカツ丼のソース', '会津ソースカツ丼のソース（ラッキー）', '会津ソースカツ丼のソース（業務用）']],
  ['【ネット専用】【自社チャーシュー】\\【NEW】訳あり800ｇ\\ネット用画像', ['【ネット】チャーシュー訳あり800ｇ']],
  ['【ネット専用】【自社チャーシュー】\\【NEW】常温中厚バラチャーシュー\\ネット用画像', ['【ネット】中厚レトルトチャーシュー380g']],
  ['【ネット専用】【自社チャーシュー】\\【NEW】常温極厚チャーシュー\\ネット用画像（スクエア）', ['【ネット】極厚レトルトチャーシュー600g']],
  ['【ネット専用】【パーフェクトラーメンSIO】\\★★★パーフェクトラーメン【S】SIO（1食具付き）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】SIO1食']],
  ['【ネット専用】【パーフェクトラーメンSIO】\\★★★パーフェクトラーメン【S】SIO（3食or9食）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】SIO3食', '【ネット】パーフェクトラーメン【S】SIO9食']],
  ['【ネット専用】【パーフェクトラーメンSIO】\\★★★SIOスープのみ（8食）\\ネット用画像', ['【ネット】完全再現スープSIOのみ8食']],
  ['【ネット専用】【パーフェクトラーメンBUTA】\\★★★パーフェクトラーメン【S】BUTA（2食or6食）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】BUTA2食']],
  ['【ネット専用】【パーフェクトラーメンIE-K】\\★★★パーフェクトラーメン【S】IE-K（2食or6食）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】IE-K2食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★パーフェクトラーメン【S】喜多方（1食具付き）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】喜多方1食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★パーフェクトラーメン【S】喜多方（3食or9食）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】喜多方3食', '【ネット】パーフェクトラーメン【S】喜多方9食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★パーフェクトラーメン【S】KITAKATAこってり背脂（2食or6食）\\ネット用画像', ['【ネット】パーフェクトラーメン【S】喜多方背脂2食', '【ネット】パーフェクトラーメン【S】喜多方背脂6食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★喜多方スープのみ（8食）\\ネット用画像', ['【ネット】完全再現スープ醤油（煮干し）8食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★KITAKATAこってり背脂スープのみ（5食）\\ネット用画像', ['【ネット】完全再現スープ醤油（背脂）5食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★ストレート麺【麺のみ】4食\\ネット用画像', ['【ネット】ストレート麺のみ4食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★喜多方ラーメン【麺のみ】ネコポス\\ネット用画像', ['【ネット】喜多方ラーメン麺のみ6食', '【ネット】喜多方ラーメン麺のみ18食', '【ネット】喜多方ラーメン麺のみ50食']],
  ['【ネット専用】【パーフェクトラーメン喜多方】\\★★★細麺【麺のみ】6食\\ネット用画像', ['【ネット】喜多方ラーメン麺のみ6食 (細麺) ']],
  ['【ネット専用】【パーフェクトラーメン鮎煮干し】\\ネット用画像', ['【ネット】パーフェクトラーメン鮎煮干し2食', '【ネット】パーフェクトラーメン鮎煮干し6食', '【ネット】完全再現スープ鮎の煮干し5食']],
  ['【ネット専用】【焼きそば麺】\\4食\\ネット用画像', ['【ネット】極太麺焼きそば＆ソース4食 ']],
  ['【ネット専用】【焼きそば麺】\\ネット用画像', ['【ネット】極太麺焼きそば麺のみ80食 ']],
  ['【ネット専用】【会津三大ラーメン】\\ネット用画像', ['【ネット】ネット用会津三大ラーメン', '会津三大ラーメン']],
  ['【ネット専用】【悪魔シリーズ】\\カレー焼きそば\\ネット用画像', ['【ネット】会津カレー焼きそば 悪魔エディション4食']],
  ['【ネット専用】【馬刺し】\\ネット用画像', ['【ネット】会津馬刺し1キロ']],
  ['【ネット専用】【辛杉家の憂鬱】\\セカンドシーズン\\辛すぎインスパイア零\\ネット用画像', ['【ネット】辛すぎInspire零', '【ネット】辛すぎInspire零 ×2']],
  ['【ネット専用】【辛杉家の憂鬱】\\セカンドシーズン\\辛すぎインスパイア凛\\ネット用画像', ['【ネット】辛すぎInspire凛', '【ネット】辛すぎInspire凛 ×2']],
  ['【ネット専用】【辛杉家の憂鬱】\\セカンドシーズン\\辛すぎインスパイア凪\\ネット用画像', ['【ネット】辛すぎInspire凪', '【ネット】辛すぎInspire凪 ×2']],
  ['【ネット専用】【辛杉家の憂鬱】\\セカンドシーズン\\辛すぎインスパイア極\\ネット用画像', ['【ネット】辛すぎInspire極', '【ネット】辛すぎInspire極 ×2']],
  ['【ネット専用】【辛杉家の憂鬱】\\コンプリートセット\\ネット用画像', ['【ネット】辛杉家の憂鬱コンプリート']],
  ['【ネット専用】【会津ブランド館カレーセット】\\ネット用画像', ['会津ブランド館カレー7種セット']],
  ['【大噴火カレー】\\ネット用画像', ['会津磐梯山　大噴火カレー']],
  ['【ふりかけ喜多方ラーメン】\\ネット用画像', ['喜多方ラーメンふりかけ', '喜多方ラーメンふりかけ（ラッキー）']],
  ['【ふりかけ蕎麦】\\ネット用画像', ['会津の蕎麦ふりかけ', '猪苗代のそばふりかけ']],
  ['【Harudekoお茶】\\そば茶\\ネット用画像', ['会津のそば茶', '猪苗代のそば茶']],
  ['【Harudekoお茶】\\こめ茶\\ネット用画像', ['会津のこめ茶']],
  ['【Harudekoお茶】\\アスパラ茶\\ネット用画像', ['会津の香ばしアスパラ茶']],
  ['【AIZU CAMPFOOD】\\ネット用画像', ['会津湯川村産コシヒカリ　無洗米1合']],
  ['【カップこづゆ】\\ネット用画像', ['會津武家料理カップこづゆ']],
  ['【喜多方醤油ラーメンだれ仕込み】\\唐揚げ飯\\ネット用画像', ['喜多方ラーメン醤油だれ仕込み　からあげ飯']],
  ['【喜多方醤油ラーメンだれ仕込み】\\チャーシュー飯\\ネット用画像', ['喜多方ラーメン醤油だれ仕込み　チャーシュー飯']],
  ['【酒塩】\\ネット用画像', ['酒塩', '酒塩（業務用）', '酒塩アウトドアMIX']],
];

function priority(fileName) {
  const name = fileName.normalize('NFKC').toLowerCase();
  if (/top|メイン|正方形|楽天/.test(name)) return 0;
  if (/amazon|base|商品|中身|説明/.test(name)) return 1;
  return 2;
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

async function compress(sourcePath, recipeId, index) {
  const outputPath = path.join(TMP_DIR, `${recipeId}-${index + 1}.webp`);
  try {
    await runPython([path.join(__dirname, 'compress_image.py'), sourcePath, outputPath]);
    return outputPath;
  } catch (error) {
    if (error.message.includes('SKIP_NON_PRODUCT_IMAGE')) return null;
    throw error;
  }
}

async function existingImageCount(recipeId) {
  const response = await fetch(`${APP_URL}/api/recipe/web-images?recipeId=${recipeId}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`gallery check failed ${response.status}`);
  const payload = await response.json();
  return (payload.images || []).length;
}

async function upload(recipe, sourcePath, index) {
  const outputPath = await compress(sourcePath, recipe.id, index);
  if (!outputPath) return 'skipped';
  const buffer = await fs.readFile(outputPath);
  const formData = new FormData();
  formData.append('file', new File([buffer], `${recipe.id}-${index + 1}.webp`, { type: 'image/webp' }));
  formData.append('recipeId', recipe.id);
  formData.append('sourceType', 'shared_folder');
  formData.append('sourceImageUrl', sourcePath);
  formData.append('originalFilename', path.basename(sourcePath));
  const response = await fetch(`${APP_URL}/api/recipe/web-images`, {
    method: 'POST', body: formData, signal: AbortSignal.timeout(60000),
  });
  if (response.status === 409) return 'duplicate';
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return 'uploaded';
}

async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const names = [...new Set(folderMappings.flatMap(([, recipeNames]) => recipeNames))];
  const { rows: recipes } = await client.query('SELECT id, name, category FROM recipes WHERE name = ANY($1::text[])', [names]);
  await client.end();
  const recipesByName = new Map(recipes.map((recipe) => [recipe.name, recipe]));

  const report = [];
  for (const [relativeFolder, recipeNames] of folderMappings) {
    const folder = path.join(ROOT, relativeFolder);
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { report.push({ folder, status: 'missing' }); continue; }
    const files = entries
      .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp)$/i.test(entry.name))
      .map((entry) => path.join(folder, entry.name))
      .sort((a, b) => priority(path.basename(a)) - priority(path.basename(b)) || a.localeCompare(b, 'ja'))
      .slice(0, MAX_IMAGES);
    for (const recipeName of recipeNames) {
      const recipe = recipesByName.get(recipeName);
      if (!recipe) { report.push({ folder, recipeName, status: 'recipe_missing' }); continue; }
      if (await existingImageCount(recipe.id) > 0) { report.push({ folder, recipeName, status: 'already_has_images' }); continue; }
      const uploads = [];
      for (const [index, sourcePath] of files.entries()) {
        try { uploads.push({ sourcePath, status: await upload(recipe, sourcePath, index) }); }
        catch (error) { uploads.push({ sourcePath, status: 'failed', error: error.message }); }
      }
      report.push({ folder, recipeName, status: uploads.some((item) => item.status === 'uploaded') ? 'completed' : 'no_images', uploads });
      console.log(`${recipeName}: ${uploads.filter((item) => item.status === 'uploaded').length}枚`);
    }
  }
  const output = path.join(TMP_DIR, 'shared-folder-report.json');
  await fs.writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(JSON.stringify({ output, completed: report.filter((item) => item.status === 'completed').length, failed: report.flatMap((item) => item.uploads || []).filter((item) => item.status === 'failed').length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
