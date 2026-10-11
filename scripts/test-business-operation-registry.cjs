// Inspect and prepare every registered workflow without loading an actual API handler or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.join(__dirname, '..');
const definitions = [];
const checkedModules = new Set();
const uuid = '00000000-0000-4000-8000-000000000001';
function localFile(specifier, importer) {
  const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(path.join(root, importer)), specifier);
  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(file => fs.existsSync(file));
}
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.equal(node.arguments.length, 1);
      assert.ok(ts.isStringLiteral(node.arguments[0]), `${file}: dynamic module selection is forbidden`);
      const specifier = node.arguments[0].text;
      if (specifier.startsWith('@/') || specifier.startsWith('.')) assert.ok(localFile(specifier, file), `${file}: missing fixed import ${specifier}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const requireStub = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'next/server') return { NextRequest };
    if (name.startsWith('node:')) return require(name);
    if (name.startsWith('@/app/api/')) {
      const target = localFile(name, file); assert.ok(target, `Missing API module ${name}`); checkedModules.add(name);
      const apiSource = ts.createSourceFile(target, fs.readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true);
      const methods = new Set();
      for (const statement of apiSource.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) methods.add(statement.name.text);
        if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) methods.add(declaration.name.text);
      }
      return Object.fromEntries([...methods].filter(method => /^(GET|POST|PATCH|PUT|DELETE)$/.test(method)).map(method => [method, async () => Response.json({ synthetic: true })]));
    }
    throw Error(`Unexpected registry test dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(requireStub, testModule, testModule.exports);
  return testModule.exports;
}
const contracts = load('lib/data-access/contracts.ts');
const common = load('lib/data-access/operation-contracts.ts', { './contracts': contracts });
const shared = { ...common, routeOperation: options => { const operation = common.routeOperation(options); definitions.push({ options, operation }); return operation; } };
function sample(schema) {
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return sample(schema.anyOf[0]);
  if (schema.type === 'null') return null;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum === undefined ? 1 : schema.type === 'integer' ? Math.ceil(schema.minimum) : schema.minimum;
  if (schema.type === 'array') return Array.from({ length: schema.minItems || 0 }, () => sample(schema.items));
  if (schema.type === 'string') {
    if (schema.format === 'uuid') return uuid;
    if (schema.format === 'date') return '2026-10-01';
    if (schema.format === 'date-time') return '2026-10-01T00:00:00Z';
    const candidates = ['fixture', 'file', 'application/octet-stream', '2026-10', '2026-10-01', 'a'.repeat(64), 'A1'];
    const candidate = candidates.find(value => (!schema.pattern || new RegExp(schema.pattern).test(value)) && value.length >= (schema.minLength || 0) && value.length <= (schema.maxLength ?? Infinity));
    if (candidate) return candidate;
    return 'x'.repeat(Math.max(1, schema.minLength || 0)).slice(0, schema.maxLength ?? Infinity);
  }
  if (schema.type === 'object') {
    const keys = new Set(schema.required || []);
    for (const key of Object.keys(schema.properties || {})) {
      if (keys.size >= (schema.minProperties || 0)) break;
      keys.add(key);
    }
    const value = Object.fromEntries([...keys].map(key => [key, sample(schema.properties[key])]));
    if (schema.properties?.base64 && schema.properties?.filename && schema.properties?.mimeType && schema.properties?.field) {
      value.base64 = Buffer.from('synthetic original').toString('base64'); value.filename = 'fixture.csv';
      if (value.sha256) value.sha256 = require('node:crypto').createHash('sha256').update('synthetic original').digest('hex');
    }
    return value;
  }
  throw Error('Unsupported registry schema');
}
async function main() {
  const recipe = load('lib/data-access/recipe-operations.ts', { './operation-contracts': shared }).recipeOperations;
  const finance = load('lib/data-access/finance-operations.ts', { './operation-contracts': shared }).financeOperations;
  const other = load('lib/data-access/other-operations.ts', { './operation-contracts': shared }).otherOperations;
  const all = [...recipe, ...finance, ...other];
  assert.ok(all.length > 100);
  assert.equal(new Set(all.map(operation => operation.name)).size, all.length, 'Every operation name must be unique');
  assert.equal(all.length, definitions.length);
  for (const { options, operation } of definitions) {
    assert.ok(!/(?:^|[_.-])(?:sql|shell|deploy|migration|credential|token|github|vercel)(?:$|[_.-])/.test(operation.name), `Unsafe operation ${operation.name}`);
    assert.ok(!/^\/api\/(?:auth|system|data-access\/connections)(?:\/|$)/.test(options.pathname), `Infrastructure route ${options.pathname}`);
    assert.equal(operation.inputSchema.type, 'object', operation.name);
    assert.equal(operation.inputSchema.additionalProperties, false, `${operation.name}: top-level schema must be strict`);
    assert.ok(!Object.keys(operation.inputSchema.properties || {}).some(key => ['url', 'pathname', 'method', 'sql', 'prompt', 'command', 'headers', 'authorization'].includes(key)), `${operation.name}: generic dispatch input is forbidden`);
    const input = sample(operation.inputSchema);
    common.validateOperationJson(input);
    try { common.validateOperationSchema(operation.inputSchema, input); }
    catch (error) { throw new Error(`${operation.name}: generated fixture failed schema (${JSON.stringify(input).slice(0, 600)})`, { cause: error }); }
    assert.throws(() => common.validateOperationSchema(operation.inputSchema, { ...input, arbitrary_url: 'https://example.invalid' }), `${operation.name}: extra keys must fail`);
    const prepared = operation.prepare(input, 'https://tsa.example.test');
    assert.equal(prepared.request.method, options.method, operation.name);
    assert.equal(new URL(prepared.request.url).origin, 'https://tsa.example.test', operation.name);
    if (options.load) {
      const loadedRoute = await options.load(); assert.equal(typeof loadedRoute[options.method], 'function', `${operation.name}: fixed handler export is missing`);
      assert.equal((await prepared.execute({ request: prepared.request, connectionId: uuid, actor: `data-access:${uuid}` })).status, 200);
    }
  }
  // A completed label check permits no image attachments, but its existing
  // handler always reads multipart data. JSON fallback would reject valid work.
  const complete = other.find(operation => operation.name === 'label_check_complete');
  const completeInput = { body: { payload: {
    request_id: uuid, mode: 'simple', worker_name: 'Synthetic operator',
    expiry_date_normalized: '2026-12-01', shelf_life: '30日',
    file_name: '', product_name: '', raw_materials: '', expiry_date_printed: '',
  } } };
  common.validateOperationSchema(complete.inputSchema, completeInput);
  for (const input of [completeInput, { ...completeInput, files: [] }]) {
    const prepared = complete.prepare(input, 'https://tsa.example.test');
    assert.match(prepared.request.headers.get('content-type'), /^multipart\/form-data;/);
    const form = await prepared.request.formData();
    assert.deepEqual(JSON.parse(form.get('payload')), completeInput.body.payload);
    assert.equal(form.getAll('images').length, 0);
  }
  const quote = other.find(operation => operation.name === 'quote_master_prices_apply');
  const quoteInput = { body: { updates: [{ category: 'ingredient', suggestion_type: 'update', original_name: 'Synthetic ingredient', final_suggestion_price: 100 }] } };
  assert.throws(() => common.validateOperationSchema(quote.inputSchema, quoteInput), 'Existing-price updates require a matched master ID');
  quoteInput.body.updates[0].matched_id = uuid;
  common.validateOperationSchema(quote.inputSchema, quoteInput);
  assert.equal(other.find(operation => operation.name === 'label_check_match').mutation, true, 'AI matching needs the execution ledger even when no database row changes');
  const catalogIndex = process.argv.indexOf('--catalog-json');
  if (catalogIndex >= 0) {
    assert.ok(process.argv[catalogIndex + 1], '--catalog-json requires an explicit output path');
    const destination = path.resolve(process.argv[catalogIndex + 1]);
    fs.writeFileSync(destination, JSON.stringify({ operations: all.map(({ name, description, mutation, inputSchema }) => ({ name, description, mutation, inputSchema })) }, null, 2), { flag: 'wx', encoding: 'utf8' });
  }
  console.log(JSON.stringify({ recipeOperations: recipe.length, financeOperations: finance.length, otherOperations: other.length, total: all.length, checkedFixedRoutes: checkedModules.size, validSchemas: true, preparedRequests: true, realHandlersExecuted: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
