// One-use loopback form for saving data already read by the documented browser API.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => i % 2 ? pairs : [...pairs, [value, all[i + 1]]], []));
if (!isAbsolute(args["--out"] || "") || !/^\d{4}-\d{2}-\d{2}$/.test(args["--start"] || "") || !/^\d{4}-\d{2}-\d{2}$/.test(args["--end"] || "")) throw new Error("--out absolute path, --start and --end are required");
const route = `/save-${randomBytes(16).toString("hex")}`;
let origin;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
  if (req.url !== route || req.headers.host !== new URL(origin).host) { res.writeHead(404); return res.end(); }
  if (req.method === "GET") return res.end('<title>BASE帳票保存</title><form method="post"><label>取得JSON<textarea name="data"></textarea></label><button>保存</button></form>');
  if (req.method !== "POST" || req.headers.origin !== origin) { res.writeHead(403); return res.end(); }
  let body = "";
  req.on("data", chunk => { body += chunk; if (body.length > 4_000_000) req.destroy(); });
  req.on("end", () => {
    try {
      const report = JSON.parse(new URLSearchParams(body).get("data"));
      if (report.channel !== "base" || report.schemaVersion !== 1 || report.start !== args["--start"] || report.end !== args["--end"] || report.lastPageVerified !== true || !Array.isArray(report.rows) || report.rows.length < 1 || report.rows.length > 5000) throw new Error("Invalid report");
      writeFileSync(args["--out"], JSON.stringify(report, null, 2), { flag: "wx" });
      res.end(`<h1>保存完了：${report.rows.length}商品</h1>`);
      console.log(JSON.stringify({ status: "saved", count: report.rows.length }));
      clearTimeout(timer); server.close();
    } catch { res.writeHead(400); res.end("保存失敗：対象期間・形式・既存ファイルを確認してください"); }
  });
});
const timer = setTimeout(() => { server.closeAllConnections(); server.close(); process.exitCode = 1; }, 180_000);
server.listen(0, "127.0.0.1", () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`${origin}${route}`);
});
