const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

async function main() {
  const [source, destination, moduleRoot] = process.argv.slice(2);
  if (!source || !destination || !moduleRoot) {
    throw new Error("Usage: node backup-sqlite.cjs <source> <destination> <module-root>");
  }
  if (!fs.existsSync(source)) throw new Error(`SQLite source not found: ${source}`);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const localRequire = createRequire(path.join(moduleRoot, "package.json"));
  const Database = localRequire("better-sqlite3");
  const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(destination);
  } finally {
    sourceDb.close();
  }

  const checkDb = new Database(destination, { readonly: true, fileMustExist: true });
  let quickCheck;
  try {
    quickCheck = checkDb.pragma("quick_check", { simple: true });
  } finally {
    checkDb.close();
  }
  if (quickCheck !== "ok") throw new Error(`SQLite quick_check failed: ${quickCheck}`);
  for (const suffix of ["-shm", "-wal"]) {
    const sidecar = `${destination}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
  }

  process.stdout.write(JSON.stringify({
    source,
    destination,
    bytes: fs.statSync(destination).size,
    quickCheck,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
