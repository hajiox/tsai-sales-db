'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const helperPath = path.join(__dirname, '../tools/tsa-codex-bridge/skills/update-aizu-ec-prices/scripts/read-lp-public-page.cjs');
const { readLpPublicPage, extractLpEvidence } = require(helperPath);
const url = 'https://ie-k.aizubrandhall-lp2.com/';
const title = '濃厚家系豚骨醤油スープのみ';
const card = (name, unit, price) => `<div data-slot="card"><div data-slot="card-header"><div data-slot="card-title">${name}</div><div>${unit}</div></div><div data-slot="card-content"><p>${price}</p></div></div>`;
const soup = price => card(title, '150ccの大容量スープ5食セット', `${price}円（税・送料込）`);
const html = `<!doctype html><html><head><title>IE-K &amp; 会津</title><style>.x{content:"404 1944円"}</style></head><body>
<div hidden><h1>404</h1><p>1,944円</p></div><header>関係ない商品 999円</header><main><section><h2>商品ラインナップ</h2>
${card('IE-K 2食セット', '麺とスープ×2食', '1,300円（税・送料込）')}
${card('IE-K 6食セット', '麺とスープ×6食', '3,450円（税・送料込）')}
${card('IE-K チャーシュー付き', '麺とスープとチャーシュー×1食', '790円（税込）送料別途')}
${soup('1,750')}</section></main>
<script>self.__next_f.push([1,{notFound:'404: This page could not be found.',price:1944,fake:'<div>1,944円</div>'}]);</script>
</body></html>`;

function fakeResponse(body = html, options = {}) {
  return new Response(body, { status: options.status || 200, headers: { 'content-type': 'text/html; charset=utf-8', ...options.headers } });
}

async function rejectsCode(work, code) {
  await assert.rejects(work, error => error.code === code, `Expected ${code}`);
}

(async () => {
  const evidence = extractLpEvidence(html);
  assert.equal(evidence.title, 'IE-K & 会津');
  assert.equal(evidence.evidence_scope, 'main');
  assert.equal(evidence.product_blocks.length, 4, 'Keep the four product cards separate from their enclosing section');
  assert.deepEqual(evidence.visible_prices, [1300, 3450, 790, 1750]);
  assert.doesNotMatch(evidence.main_text, /404|1944|999|__next_f/);
  assert.equal(evidence.truncated, false);
  assert.match(evidence.limitation, /external CSS visibility/);
  const onlySoup = extractLpEvidence(html, { match: title });
  assert.equal(onlySoup.product_blocks.length, 1);
  const original = onlySoup.product_blocks[0];
  assert.match(original.block_id, /^LPB_[0-9a-f]{16}$/);
  assert.deepEqual(original.prices, [1750]);
  assert.match(original.text, /150cc.*5食.*1,750円/);
  assert.doesNotMatch(original.text, /790/);
  const changed = extractLpEvidence(html.replace('1,750円', '1,944円'), { match: title }).product_blocks[0];
  assert.equal(changed.block_id, original.block_id, 'Price edits keep the binding stable');
  assert.deepEqual(changed.prices, [1944]);
  const wrongProductChanged = extractLpEvidence(html.replace('790円', '1,944円'));
  assert.deepEqual(wrongProductChanged.product_blocks.find(block => block.block_id === original.block_id).prices, [1750],
    'Another card at the target price must not satisfy the soup binding');
  assert.notEqual(extractLpEvidence(`<main>${card(title, '150ccの大容量スープ6食セット', '1,750円')}</main>`).product_blocks[0].block_id, original.block_id,
    'Sale-unit numbers remain part of the binding');

  const onePackCard = price => card('IE-K 1食チャーシュー付き', '麺とスープとチャーシュー×1食', `${price}円（税込）送料別途`)
    .replace('</p>', '</p><p>2個まで全国一律300円</p>');
  const fourProducts = extractLpEvidence(`<main>${card('IE-K 2食セット', '麺とスープ×2食', '1,300円（税・送料込）')}
    ${card('IE-K 6食セット', '麺とスープ×6食', '3,450円（税・送料込）')}${onePackCard(790)}${soup('1,944')}</main>`);
  assert.deepEqual(fourProducts.product_blocks.map(block => block.item_prices), [[1300], [3450], [790], [1944]]);
  assert.deepEqual(fourProducts.product_blocks.map(block => block.shipping_prices), [[], [], [300], []]);
  const onePack = fourProducts.product_blocks[2];
  assert.deepEqual(onePack.prices, [790, 300], 'The original all-price field is preserved');
  assert.deepEqual(onePack.price_evidence.map(entry => [entry.value, entry.kind]), [[790, 'item'], [300, 'shipping']]);
  assert.match(onePack.price_evidence[1].source_text, /送料別途.*2個まで全国一律300円/);
  const onePackChanged = extractLpEvidence(`<main>${onePackCard(885)}</main>`).product_blocks[0];
  assert.equal(onePackChanged.block_id, onePack.block_id);
  assert.deepEqual(onePackChanged.item_prices, [885]);
  assert.deepEqual(onePackChanged.shipping_prices, [300], 'Editing the item price must not alter shipping evidence');
  const inlineShipping = extractLpEvidence(`<main>${card('IE-K 1食', '1食', '790円（税込）送料別途 2個まで全国一律300円')}</main>`).product_blocks[0];
  assert.deepEqual(inlineShipping.item_prices, [790]);
  assert.deepEqual(inlineShipping.shipping_prices, [300]);
  const labelledShipping = extractLpEvidence(`<main>${card('商品', '1食', '商品価格790円（税込）＋送料：300円')}</main>`).product_blocks[0];
  assert.deepEqual(labelledShipping.item_prices, [790]);
  assert.deepEqual(labelledShipping.shipping_prices, [300]);
  for (const prices of ['通常790円・特価700円', '商品A790円・商品B850円', '790円（税込）送料別途 期間限定300円', '790円（税込）全国一律300円']) {
    const ambiguous = extractLpEvidence(`<main>${card('商品', '1食', prices)}</main>`).product_blocks[0];
    assert.equal(ambiguous.item_prices.length, 2, 'Unlabelled, discount and two-item prices must remain ambiguous: ' + prices);
    assert.deepEqual(ambiguous.shipping_prices, []);
  }
  const unrelatedNote = extractLpEvidence(`<main>${card('商品', '1食', '790円（税込）送料別途').replace('</p>', '</p><p>期間限定300円</p>')}</main>`).product_blocks[0];
  assert.deepEqual(unrelatedNote.item_prices, [790, 300], 'An arbitrary next paragraph is not a shipping charge');
  assert.deepEqual(unrelatedNote.shipping_prices, []);

  const suppressed = extractLpEvidence(`<head><title>本当のタイトル</title></head><body><main>
    <script><main>${soup('1,944')}</main></script><style>1,944円</style>
    <template><template>1,944円</template>${soup('1,944')}</template><noscript>1,944円</noscript>
    <div hidden="false">1,944円</div><div aria-hidden=" TRUE "><p>1,944円</p></div>
    <section style="display: none !important"><div>1,944円</div></section>
    <div style="color:red;visibility:hidden;">1,944円</div>
    <div style="content-visibility: hidden">1,944円</div><textarea hidden>1,944円</textarea><div style="display:/*comment*/none">1,944円</div>
    <!-- ${soup('1,944')} --><div data-note="value > 1,944円">本文だけ</div>
    ${soup('1,750')}</main></body>`);
  assert.deepEqual(suppressed.visible_prices, [1750]);
  assert.equal(suppressed.product_blocks.length, 1);
  assert.doesNotMatch(suppressed.main_text, /1,944/);
  assert.deepEqual(extractLpEvidence('<body><script>"1,750円"</script><p>price=1750; HTTP 404</p></body>').visible_prices, []);
  assert.equal(extractLpEvidence('<body><article><h2>商品</h2><p>税込 &yen;&nbsp;１，７５０</p></article></body>').product_blocks[0].prices[0], 1750);
  assert.deepEqual(extractLpEvidence('<main><p>1,750.00円 -100円 1750 ¥1944 ７９０円 &#x31;&#57;&#52;&#52;円</p></main>').visible_prices, [1944, 790]);
  const inline = extractLpEvidence(`<main><div><h2>濃厚<span>スープ</span></h2><p><span>1,</span><span>750円</span></p></div></main>`, { match: '濃厚スープ' });
  assert.equal(inline.product_blocks.length, 1);
  assert.deepEqual(inline.product_blocks[0].prices, [1750]);
  assert.equal(extractLpEvidence('<body><section><h2>商品</h2><p>1750円</p></section></body>').evidence_scope, 'body');
  assert.deepEqual(extractLpEvidence('<main><div hidden/>1944円</div><p>1750円</p></main>').visible_prices, [1750],
    'A self-closing slash must not escape a hidden HTML ancestor');

  const longPage = `<main>${'説明'.repeat(2500)}${Array.from({ length: 25 }, (_, index) => card('商品' + index, '5食', '1944円' + '説明'.repeat(1200))).join('')}</main>`;
  const bounded = extractLpEvidence(longPage);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.main_text.length <= 4000);
  assert.ok(bounded.product_blocks.reduce((total, block) => total + block.text.length, 0) <= 8000);
  assert.ok(bounded.product_blocks.every(block => block.price_evidence.length <= 8 && block.price_evidence.every(entry => entry.source_text.length <= 200)));
  assert.equal(extractLpEvidence(`<main>${'説明'.repeat(2500)}${soup('1,750')}</main>`, { match: title }).product_blocks.length, 1,
    'A matching product after the main-text output cap still gets its own evidence block');

  let request;
  const result = await readLpPublicPage(url, { match: title, fetchImpl: async (input, init) => { request = { input, init }; return fakeResponse(); } });
  assert.equal(result.url, url);
  assert.equal(result.final_url, url);
  assert.equal(result.http_status, 200);
  assert.match(result.content_type, /text\/html/);
  assert.deepEqual(result.product_blocks[0].prices, [1750]);
  assert.equal(request.input, url);
  assert.equal(request.init.redirect, 'manual');
  assert.equal(request.init.headers['Cache-Control'], 'no-cache');
  assert.equal(request.init.headers.Pragma, 'no-cache');
  await rejectsCode(readLpPublicPage('http://example.invalid/', { fetchImpl: () => assert.fail('Invalid URLs must not be fetched') }), 'INVALID_URL');
  await rejectsCode(readLpPublicPage('https://user:password@example.invalid/'), 'INVALID_URL');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse('404', { status: 404 }) }), 'HTTP_STATUS');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse('{}', { headers: { 'content-type': 'application/json' } }) }), 'CONTENT_TYPE');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse(new Uint8Array([0xc3, 0x28])) }), 'INVALID_UTF8');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse('text', { headers: { 'content-type': 'text/html; charset=shift_jis' } }) }), 'INVALID_UTF8');
  await rejectsCode(readLpPublicPage(url, { maxBytes: 10, fetchImpl: async () => fakeResponse() }), 'MAX_BYTES');
  await rejectsCode(readLpPublicPage(url, { maxBytes: 10, fetchImpl: async () => fakeResponse('small', { headers: { 'content-length': '100' } }) }), 'MAX_BYTES');
  await rejectsCode(readLpPublicPage(url, { timeoutMs: 10, fetchImpl: () => new Promise(() => {}) }), 'TIMEOUT');
  await rejectsCode(readLpPublicPage(url, { timeoutMs: 10, fetchImpl: async () => fakeResponse(new ReadableStream({ start() {} })) }), 'TIMEOUT');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse('', { status: 302, headers: { location: 'https://other.example/' } }) }), 'REDIRECT_URL');
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => fakeResponse('', { status: 302, headers: { location: '/' } }) }), 'REDIRECT_URL');
  let requests = 0;
  const redirected = await readLpPublicPage(url, { fetchImpl: async () => ++requests === 1 ? fakeResponse('', { status: 302, headers: { location: '/product' } }) : fakeResponse() });
  assert.equal(redirected.final_url, url + 'product');
  assert.equal(requests, 2);
  const impostor = fakeResponse();
  Object.defineProperty(impostor, 'url', { value: 'https://other.example/' });
  await rejectsCode(readLpPublicPage(url, { fetchImpl: async () => impostor }), 'REDIRECT_URL');
  const cliError = spawnSync(process.execPath, [helperPath, '--url', 'http://example.invalid/'], { encoding: 'utf8' });
  assert.equal(cliError.status, 1);
  assert.equal(JSON.parse(cliError.stdout).error.code, 'INVALID_URL');
  assert.equal(cliError.stderr, '');
  console.log('LP public reader: visible product blocks, stable price bindings, bounded output and HTTPS failure tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
