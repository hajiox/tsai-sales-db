#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');

const MAX_BYTES = 1024 * 1024;
const LIMITATION = 'Parsed static HTML text only; JavaScript and external CSS visibility are not evaluated.';
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const BLOCK = new Set('address article aside blockquote br div dl dt dd footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tr td th ul'.split(' '));
const RAW_HIDDEN = new Set(['script', 'style', 'noscript']);
const YEN = /(?<![\d.,-])(?:¥\s*(\d{1,3}(?:,\s*\d{3})+|\d+)(?![\d.,])(?:\s*円)?|(\d{1,3}(?:,\s*\d{3})+|\d+)\s*円)/g;

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', yen: '¥', ensp: ' ', emsp: ' ', thinsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole;
    const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '\ufffd';
  });
}

function normalized(text) {
  return decodeEntities(text).normalize('NFKC').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function pricesIn(text) {
  return [...new Set([...text.matchAll(YEN)].map(match => Number((match[1] || match[2]).replace(/[,\s]/g, ''))).filter(value => Number.isSafeInteger(value) && value >= 0))];
}

function blockId(text) {
  return 'LPB_' + createHash('sha256').update(text.replace(YEN, '<PRICE>'), 'utf8').digest('hex').slice(0, 16);
}

// This deliberately does not execute scripts or attempt browser/CSS rendering.
// A quote-aware tokenizer prevents attributes and raw script text becoming evidence.
function parseHtml(html) {
  const root = { tag: '', attrs: {}, children: [], parent: null, suppressed: false };
  const stack = [root];
  const lower = html.toLowerCase();
  let title = '';
  let at = 0;
  const append = text => { if (!stack[stack.length - 1].suppressed) stack[stack.length - 1].children.push(text); };
  while (at < html.length) {
    if (html[at] !== '<') {
      const end = html.indexOf('<', at);
      append(html.slice(at, end < 0 ? html.length : end));
      at = end < 0 ? html.length : end;
      continue;
    }
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    let end = at + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) break;
    const token = html.slice(at + 1, end);
    at = end + 1;
    if (/^\s*[!?]/.test(token)) continue;
    const tagMatch = /^\s*(\/?)\s*([a-z][\w:-]*)\b/i.exec(token);
    if (!tagMatch) { append('<' + token + '>'); continue; }
    const tag = tagMatch[2].toLowerCase();
    if (tagMatch[1]) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tag === tag) { stack.length = index; break; }
      }
      continue;
    }
    const attrs = {};
    const attrSource = token.slice(tagMatch[0].length);
    const attrPattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of attrSource.matchAll(attrPattern)) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    const parent = stack[stack.length - 1];
    const hidden = Object.hasOwn(attrs, 'hidden') || String(attrs['aria-hidden']).trim().toLowerCase() === 'true'
      || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test((attrs.style || '').replace(/\/\*[\s\S]*?\*\//g, ''));
    if (RAW_HIDDEN.has(tag) || tag === 'title' || tag === 'textarea') {
      const closePattern = new RegExp('</' + tag + '\\s*>', 'g');
      closePattern.lastIndex = at;
      const close = closePattern.exec(lower);
      const text = html.slice(at, close ? close.index : html.length);
      if (tag === 'title' && !title && !stack.some(node => node.suppressed && node.tag !== 'head')) title = normalized(text);
      if (tag === 'textarea' && !hidden) append(text);
      at = close ? closePattern.lastIndex : html.length;
      continue;
    }
    const node = { tag, attrs, children: [], parent, suppressed: parent.suppressed || hidden || tag === 'head' || tag === 'template' };
    parent.children.push(node);
    if (!VOID.has(tag)) {
      if (stack.length >= 256) throw failure('HTML_DEPTH', 'Public HTML nesting exceeds the reader limit');
      stack.push(node);
    }
  }
  return { root, title };
}

function extractLpEvidence(html, options = {}) {
  if (typeof html !== 'string') throw failure('HTML_INPUT', 'HTML input must be a string');
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw failure('MAX_BYTES', 'Public HTML exceeds the 1 MiB reader limit');
  const { root, title } = parseHtml(html);
  const nodes = [];
  function visit(node) {
    if (typeof node === 'string' || node.suppressed) return;
    nodes.push(node);
    for (const child of node.children) visit(child);
  }
  visit(root);
  const mainNodes = nodes.filter(node => node.tag === 'main');
  const scopes = mainNodes.length ? mainNodes : nodes.filter(node => node.tag === 'body');
  if (!scopes.length) scopes.push(root);
  const textCache = new Map();
  function textOf(node) {
    if (typeof node === 'string') return node;
    if (node.suppressed) return '';
    if (!textCache.has(node)) {
      const text = node.children.map(textOf).join('');
      textCache.set(node, BLOCK.has(node.tag) ? '\n' + text + '\n' : text);
    }
    return textCache.get(node);
  }
  function inScope(node) {
    for (let current = node; current; current = current.parent) if (scopes.includes(current)) return true;
    return false;
  }
  function hasHeading(node) {
    return node.children.some(child => typeof child !== 'string' && !child.suppressed && (/^h[1-6]$/.test(child.tag) || child.attrs['data-slot'] === 'card-title' || hasHeading(child)));
  }
  const candidates = nodes.filter(node => inScope(node) && (
    node.attrs['data-slot'] === 'card' || node.tag === 'article' || node.tag === 'section' || (node.tag === 'div' && hasHeading(node))
  )).map(node => ({ node, text: normalized(textOf(node)) })).filter(candidate => pricesIn(candidate.text).length);
  const candidateNodes = new Set(candidates.map(candidate => candidate.node));
  const ancestorsWithCandidate = new Set();
  for (const candidate of candidates) for (let parent = candidate.node.parent; parent; parent = parent.parent) if (candidateNodes.has(parent)) ancestorsWithCandidate.add(parent);
  const match = options.match == null ? '' : normalized(String(options.match));
  const selected = candidates.filter(candidate => !ancestorsWithCandidate.has(candidate.node) && (!match || candidate.text.includes(match)));
  const mainText = normalized(scopes.map(textOf).join('\n'));
  const visiblePrices = pricesIn(mainText);
  let remaining = 8000;
  let truncated = mainText.length > 4000 || visiblePrices.length > 64;
  const productBlocks = [];
  for (const candidate of selected) {
    if (!remaining || productBlocks.length >= 16) { truncated = true; break; }
    const text = candidate.text.slice(0, Math.min(2000, remaining));
    const prices = pricesIn(candidate.text);
    truncated ||= text.length < candidate.text.length || prices.length > 32;
    remaining -= text.length;
    productBlocks.push({ block_id: blockId(candidate.text), text, prices: prices.slice(0, 32) });
  }
  return {
    title: title.slice(0, 300), evidence_scope: mainNodes.length ? 'main' : 'body',
    main_text: mainText.slice(0, 4000), product_blocks: productBlocks,
    visible_prices: visiblePrices.slice(0, 64), truncated: truncated || title.length > 300,
    limitation: LIMITATION,
  };
}

function httpsUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure('INVALID_URL', 'A valid registered HTTPS LP URL is required'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw failure('INVALID_URL', 'Only public HTTPS LP URLs without credentials are permitted');
  return url;
}

async function readLpPublicPage(url, options = {}) {
  const initial = httpsUrl(url);
  const timeoutMs = Math.min(20000, Number(options.timeoutMs ?? 20000));
  const maxBytes = Math.min(MAX_BYTES, Number(options.maxBytes ?? MAX_BYTES));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw failure('READ_OPTIONS', 'Reader limits must be positive integers');
  const controller = new AbortController();
  let timer;
  const timedOut = () => failure('TIMEOUT', 'Public LP HTTPS read timed out', { url: initial.href });
  const read = async () => {
    let current = initial;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await (options.fetchImpl || fetch)(current.href, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/html', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      const finalUrl = httpsUrl(response.url || current.href);
      if (finalUrl.origin !== initial.origin) throw failure('REDIRECT_URL', 'Public LP redirected outside the registered HTTPS origin', { url: initial.href, final_url: finalUrl.href });
      const meta = { url: initial.href, final_url: finalUrl.href, http_status: response.status, content_type: response.headers.get('content-type') || '' };
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
        const next = httpsUrl(new URL(response.headers.get('location'), current).href);
        if (next.origin !== initial.origin || redirects === 3) throw failure('REDIRECT_URL', 'Public LP redirect is outside the registered origin or exceeds the redirect limit', meta);
        await response.body?.cancel();
        current = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw failure('HTTP_STATUS', 'Public LP returned HTTP ' + response.status, meta);
      if (!/^text\/html(?:\s*;|\s*$)/i.test(meta.content_type)) throw failure('CONTENT_TYPE', 'Public LP response is not HTML', meta);
      const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(meta.content_type)?.[1];
      if (charset && !/^(?:utf-?8|us-ascii)$/i.test(charset)) throw failure('INVALID_UTF8', 'Public LP does not declare UTF-8 HTML', meta);
      if (Number(response.headers.get('content-length')) > maxBytes) throw failure('MAX_BYTES', 'Public LP exceeds the response byte limit', meta);
      const reader = response.body?.getReader();
      const chunks = [];
      let bytes = 0;
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > maxBytes) { reader.cancel().catch(() => {}); throw failure('MAX_BYTES', 'Public LP exceeds the response byte limit', meta); }
          chunks.push(part.value);
        }
      }
      let html;
      try { html = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { throw failure('INVALID_UTF8', 'Public LP contains invalid UTF-8 bytes', meta); }
      return { ...meta, ...extractLpEvidence(html, options) };
    }
  };
  try {
    return await Promise.race([read(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(timedOut()); }, timeoutMs); })]);
  } catch (error) {
    if (controller.signal.aborted) throw timedOut();
    if (error.code) throw error;
    throw failure('HTTPS_READ', 'Public LP HTTPS read failed: ' + error.message, { url: initial.href });
  } finally { clearTimeout(timer); }
}

module.exports = { readLpPublicPage, extractLpEvidence };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      if (!['--url', '--match'].includes(args[index]) || !args[index + 1]) throw failure('CLI_ARGUMENTS', 'Usage: node read-lp-public-page.cjs --url <registered HTTPS URL> [--match <literal product phrase>]');
      options[args[index].slice(2)] = args[index + 1];
    }
    if (!options.url) throw failure('CLI_ARGUMENTS', '--url is required');
    process.stdout.write(JSON.stringify(await readLpPublicPage(options.url, { match: options.match })) + '\n');
  })().catch(error => {
    const details = {};
    for (const key of ['url', 'final_url', 'http_status', 'content_type']) if (error[key] != null) details[key] = error[key];
    process.stdout.write(JSON.stringify({ error: { code: error.code || 'HTTPS_READ', message: error.message, ...details } }) + '\n');
    process.exitCode = 1;
  });
}
