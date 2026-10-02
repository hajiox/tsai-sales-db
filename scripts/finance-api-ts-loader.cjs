const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function registerFinanceTsLoader(projectRoot) {
  const root = path.resolve(projectRoot);
  const previousResolve = Module._resolveFilename;
  const previousTs = Module._extensions[".ts"];
  const previousTsx = Module._extensions[".tsx"];
  Module._resolveFilename = function (request, parent, ...rest) {
    const target = typeof request === "string" && request.startsWith("@/") ? path.join(root, request.slice(2)) : request;
    return previousResolve.call(this, target, parent, ...rest);
  };
  function compile(module, filename) {
    const relative = path.relative(root, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("node_modules")) {
      throw new Error("Finance worker cannot compile files outside this checkout.");
    }
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, { fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    module._compile(output, filename);
  }
  Module._extensions[".ts"] = compile;
  Module._extensions[".tsx"] = compile;
  return () => {
    Module._resolveFilename = previousResolve;
    if (previousTs) Module._extensions[".ts"] = previousTs; else delete Module._extensions[".ts"];
    if (previousTsx) Module._extensions[".tsx"] = previousTsx; else delete Module._extensions[".tsx"];
  };
}
module.exports = { registerFinanceTsLoader };
