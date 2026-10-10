const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(relative, aliases = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  }}).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireOriginal = instance.require.bind(instance);
  instance.require = name => aliases[name] || requireOriginal(name);
  instance._compile(compiled, filename);
  return instance.exports;
}
const lifecycle = load('lib/ec-channel-lifecycle.ts');
const aliases = { '@/lib/ec-channel-lifecycle': lifecycle, '@/lib/utils': { nf: n => Number(n).toLocaleString('ja-JP') } };
const Summary = load('components/sales-summary-table.tsx', aliases).default;
const Imports = load('components/WebSalesImportButtons.tsx', aliases).default;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const september = render(Summary, { dailyData: {}, monthlyData: {}, period: '2026-09', isLoading: false });
assert.match(september, /メルカリ/);
assert.match(september, /Qoo10/);
assert.doesNotMatch(september, /makeshop/);
const october = render(Summary, { dailyData: {}, monthlyData: {}, period: '2026-10', isLoading: false });
assert.doesNotMatch(october, /メルカリ|Qoo10|TikTok/);
assert.match(october, /makeshop/);
assert.match(october, /colSpan="8"[^>]*>開店準備中/);
const lateSaved = render(Summary, { dailyData: { mercari_amount: 1200 }, monthlyData: { m_mercari_total: 1200 }, period: '2026-10', isLoading: false });
assert.match(lateSaved, /メルカリ/);
assert.match(lateSaved, /1,200円/);
const callbacks = Object.fromEntries(['onCsvClick', 'onAmazonClick', 'onRakutenClick', 'onYahooClick', 'onMercariClick', 'onBaseClick', 'onQoo10Click', 'onTiktokClick'].map(key => [key, () => { throw Error('Rendering must not execute an import'); }]));
const historicalImports = render(Imports, { ...callbacks, isUploading: false, month: '2026-09' });
assert.match(historicalImports, /メルカリ/);
assert.match(historicalImports, /Qoo10/);
assert.match(historicalImports, /TikTok/);
const currentImports = render(Imports, { ...callbacks, isUploading: false, month: '2026-10' });
assert.doesNotMatch(currentImports, /メルカリ|Qoo10|TikTok/);
assert.match(currentImports, /disabled=""[^>]*>makeshop 開店準備中/);
console.log('PASS: September historical UI, October active stores, preserved late values and disabled makeshop slot');
