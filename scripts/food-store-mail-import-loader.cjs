const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (!['food-store-mail-import', 'brand-store-mail-import'].includes(name)) throw new Error('Unsupported mail module');
  if (cache.has(name)) return cache.get(name);
  const file = path.join(__dirname, '..', 'lib', name + '.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, (specifier) => specifier === './brand-store-mail-import' ? load('brand-store-mail-import') : require(specifier));
  cache.set(name, module.exports);
  return module.exports;
}
module.exports = { load };
