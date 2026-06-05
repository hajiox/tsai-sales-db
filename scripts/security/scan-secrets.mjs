import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ignoredDirs = new Set([
  '.git',
  '.next',
  '.vercel',
  'node_modules',
]);

const ignoredFileNames = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const ignoredPathParts = [
  `${path.sep}.agent${path.sep}`,
];

const allowedEnvFile = /(^|[\\/])\.env($|[.\w-]*$)/;
const textFile = /\.(cjs|csv|env|example|js|json|jsx|md|mjs|sql|ts|tsx|txt|yaml|yml)$/i;

const checks = [
  {
    name: 'Postgres URL with embedded password',
    pattern: /postgres(?:ql)?:\/\/[^:\s"'`]+:[^@\s"'`]+@[^)\s"'`]+/g,
  },
  {
    name: 'OpenAI API key',
    pattern: /sk-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'Google API key',
    pattern: /AIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    name: 'GitHub token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/g,
  },
  {
    name: 'Vercel token',
    pattern: /vercel_[A-Za-z0-9]{20,}/g,
  },
  {
    name: 'Supabase JWT key',
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    validate: (value) => {
      const payload = decodeJwtPayload(value);
      return payload?.iss === 'supabase' || payload?.ref || payload?.role === 'service_role';
    },
  },
];

function decodeJwtPayload(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isIgnoredPath(filePath) {
  const relative = path.relative(root, filePath);
  if (allowedEnvFile.test(relative)) return true;
  if (ignoredFileNames.has(path.basename(filePath))) return true;
  return ignoredPathParts.some((part) => filePath.includes(part));
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) listFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && textFile.test(entry.name) && !isIgnoredPath(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function redact(value) {
  if (value.length <= 12) return '[REDACTED]';
  return `${value.slice(0, 6)}...[REDACTED]...${value.slice(-4)}`;
}

const findings = [];

for (const file of listFiles(root)) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = text.split(/\r?\n/);
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of text.matchAll(check.pattern)) {
      const value = match[0];
      if (check.validate && !check.validate(value)) continue;

      const before = text.slice(0, match.index);
      const lineNumber = before.split(/\r?\n/).length;
      const line = lines[lineNumber - 1] || '';
      findings.push({
        type: check.name,
        file: path.relative(root, file),
        line: lineNumber,
        sample: line.replace(value, redact(value)).trim(),
      });
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed. Remove hard-coded credentials from these files:');
  for (const finding of findings) {
    console.error(`- ${finding.type}: ${finding.file}:${finding.line}`);
    console.error(`  ${finding.sample}`);
  }
  process.exit(1);
}

console.log('Secret scan passed. No hard-coded credentials found outside .env files.');
