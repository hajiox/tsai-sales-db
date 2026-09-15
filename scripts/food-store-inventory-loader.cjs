const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name) {
  const file = path.join(__dirname, '..', 'lib', name + '.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, (name) => name.startsWith('./food-store-inventory') || ['./inventory-total', './inventory-tax'].includes(name) ? load(name.slice(2)) : require(name));
  return module.exports;
}
module.exports = { load };
