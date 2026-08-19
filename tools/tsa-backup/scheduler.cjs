const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const programRoot = "C:\\ProgramData\\TSA-Backup";
const configPath = path.join(programRoot, "backup.config.json");
const statePath = path.join(programRoot, "scheduler-state.json");
const scripts = {
  dailyData: path.join(__dirname, "Invoke-TsaDataBackup.ps1"),
  weeklyImage: path.join(__dirname, "Invoke-TsaSystemImageBackup.ps1"),
  audit: path.join(__dirname, "Invoke-TsaBackupAudit.ps1"),
};

let running = false;

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function localParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); }
  catch { return {}; }
}

function saveState(state) {
  fs.mkdirSync(programRoot, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", script,
      "-ConfigPath", configPath,
    ], { windowsHide: true, stdio: "inherit" });
    child.once("error", (error) => resolve({ ok: false, code: -1, error: error.message }));
    child.once("exit", (code) => resolve({ ok: code === 0, code: code ?? -1 }));
  });
}

async function execute(kind, script, dateKey) {
  running = true;
  const state = loadState();
  state[`${kind}Attempt`] = dateKey;
  state[`${kind}AttemptedAt`] = new Date().toISOString();
  saveState(state);
  console.log(`[backup-scheduler] start ${kind} ${dateKey}`);
  const result = await runPowerShell(script);
  const updated = loadState();
  updated[`${kind}Result`] = result.ok ? "success" : "failed";
  updated[`${kind}ExitCode`] = result.code;
  updated[`${kind}CompletedAt`] = new Date().toISOString();
  if (result.ok) updated[kind] = dateKey;
  saveState(updated);
  console.log(`[backup-scheduler] finish ${kind} code=${result.code}`);
  running = false;
}

async function tick() {
  if (running || !fs.existsSync(configPath)) return;
  const now = new Date();
  const dateKey = localDateKey(now);
  const { weekday, minutes } = localParts(now);
  const state = loadState();

  if (minutes >= 90 && state.dailyData !== dateKey && state.dailyDataAttempt !== dateKey) {
    await execute("dailyData", scripts.dailyData, dateKey);
    return;
  }
  if (weekday === "Sun" && minutes >= 180 && state.weeklyImage !== dateKey && state.weeklyImageAttempt !== dateKey) {
    await execute("weeklyImage", scripts.weeklyImage, dateKey);
    return;
  }
  if (minutes >= 390 && state.audit !== dateKey && state.auditAttempt !== dateKey) {
    await execute("audit", scripts.audit, dateKey);
  }
}

async function safeTick() {
  try { await tick(); }
  catch (error) {
    running = false;
    console.error(`[backup-scheduler] tick failed: ${error.stack || error.message}`);
  }
}

console.log("[backup-scheduler] online: daily 01:30 / Sunday image 03:00 / audit 06:30 JST");
void safeTick();
const timer = setInterval(() => void safeTick(), 60_000);
process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
