import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { Pool as PgPool } from "pg";
import { z } from "zod";
import { webSalesAnalysisResultSchema } from "./schema";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const directAnalysisSaveSchema = z.object({
  month: monthSchema,
  requestId: z.string().uuid(),
  packetHash: z.string().regex(/^[0-9a-f]{64}$/),
  packet: z.record(z.string(), z.unknown()),
  model: z.string().min(1).max(100),
  data: webSalesAnalysisResultSchema,
});

export type DirectAnalysisSave = z.infer<typeof directAnalysisSaveSchema>;

export class DirectAnalysisConflict extends Error {}

export function monthlyAnalysisPeriod(month: string) {
  monthSchema.parse(month);
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    startDate: `${month}-01`,
    endDate: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function analysisPacketHash(packet: Record<string, unknown>) {
  const { generated_at: _generatedAt, ...stablePacket } = packet;
  return sha256(stablePacket);
}

export function assertDirectPacket(input: DirectAnalysisSave, freshPacket: Record<string, unknown>) {
  const period = monthlyAnalysisPeriod(input.month);
  const receivedPeriod = input.packet.period as Record<string, unknown> | undefined;
  if (
    input.packet.report_month !== input.month
    || input.packet.packet_version !== 2
    || receivedPeriod?.start_date !== period.startDate
    || receivedPeriod?.end_date !== period.endDate
    || receivedPeriod?.type !== "monthly"
    || (input.packet.analysis_scope as Record<string, unknown> | undefined)?.period_type !== "monthly"
  ) throw new DirectAnalysisConflict("月次分析パケットの対象期間が一致しません");
  if (
    analysisPacketHash(input.packet) !== input.packetHash
    || analysisPacketHash(freshPacket) !== input.packetHash
  ) throw new DirectAnalysisConflict("分析データが更新されました。最新パケットで分析し直してください");
}

export type DirectCostWarning = {
  productId: string;
  name: string;
  savedCost: number | null;
  reason: string;
};

export function withDirectCostWarnings(
  packet: Record<string, unknown>,
  warnings: DirectCostWarning[],
) {
  return {
    ...packet,
    data_quality: {
      ...(packet.data_quality as Record<string, unknown>),
      direct_cost_warnings: warnings,
    },
  };
}

export async function loadDirectCostWarnings(
  client: Pick<PoolClient, "query">,
  month: string,
): Promise<DirectCostWarning[]> {
  monthSchema.parse(month);
  const result = await client.query<{
    product_id: string;
    name: string | null;
    unit_cost_ex_ec: number | null;
    unit_price: number | null;
  }>(
    `SELECT sales.product_id, product.name, sales.unit_cost_ex_ec, sales.unit_price
       FROM web_sales_summary AS sales
       LEFT JOIN products AS product ON product.id = sales.product_id
      WHERE sales.report_month = $1::date
        AND (COALESCE(sales.amazon_count, 0) + COALESCE(sales.rakuten_count, 0)
           + COALESCE(sales.yahoo_count, 0) + COALESCE(sales.mercari_count, 0)
           + COALESCE(sales.base_count, 0) + COALESCE(sales.qoo10_count, 0)
           + COALESCE(sales.tiktok_count, 0)) > 0
        AND (sales.unit_cost_ex_ec IS NULL OR sales.unit_cost_ex_ec <= 0
             OR (COALESCE(sales.unit_profit_rate, product.profit_rate, 0) = 0
                 AND sales.unit_cost_ex_ec = sales.unit_price))
      ORDER BY product.name, sales.product_id LIMIT 30`,
    [`${month}-01`],
  );
  return result.rows.map((row) => ({
    productId: row.product_id,
    name: row.name || row.product_id,
    savedCost: row.unit_cost_ex_ec == null ? null : Number(row.unit_cost_ex_ec),
    reason: row.unit_cost_ex_ec == null || Number(row.unit_cost_ex_ec) <= 0
      ? "月次保存原価が空欄または0以下"
      : "保存利益率0%で販売単価を原価として計上。実原価の確認が必要",
  }));
}

export function assertDirectQuality(
  input: DirectAnalysisSave,
  freshPacket: Record<string, unknown>,
  costWarnings: DirectCostWarning[],
) {
  const quality = freshPacket.data_quality as Record<string, unknown> | undefined;
  const channels = Array.isArray(quality?.channels) ? quality.channels as Record<string, unknown>[] : [];
  const incomplete = channels.filter((row) => row.settlement_coverage !== "complete" || row.settlement_estimated === true);
  const limitations = input.data.data_quality.limitations.join(" ");
  if (costWarnings.length > 0 && (input.data.status !== "needs_review" || !/原価|cost/i.test(limitations))) {
    throw new DirectAnalysisConflict("保存原価が未確認の商品があります。要確認の分析として原価の制約を記載してください");
  }
  if (costWarnings.some((warning) => warning.reason.includes("保存利益率0%"))
    && !/利益率\s*0\s*%|販売単価.*原価/.test(limitations)) {
    throw new DirectAnalysisConflict("利益率0%から販売単価を原価扱いした商品があります。この推定理由を制約に明記してください");
  }
  if (incomplete.length > 0 && (input.data.status !== "needs_review" || !/精算|控除|費用|未取得|概算/.test(limitations))) {
    throw new DirectAnalysisConflict("EC精算が未確定の媒体があります。要確認の分析として制約を記載してください");
  }
}

type SavedAnalysis = {
  status: string;
  analysisId: string;
  jobId: string;
  version: number;
  tsgPostStatus: "skipped";
  duplicate: boolean;
};

export async function saveDirectAnalysis(
  client: PoolClient,
  input: DirectAnalysisSave,
  adminEmail: string,
): Promise<SavedAnalysis> {
  const period = monthlyAnalysisPeriod(input.month);
  const idempotencyKey = `codex-desktop-web-sales-analysis:${input.requestId}`;
  const resultHash = sha256({ model: input.model, data: input.data });
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('web-sales-analysis-direct'), hashtext($1))", [input.month]);
    const existing = await client.query<{
      id: string;
      parameters: Record<string, unknown>;
      analysis_id: string | null;
      version: number | null;
      status: string | null;
    }>(
      `SELECT job.id, job.parameters, analysis.id AS analysis_id, analysis.version, analysis.status
         FROM web_sales_codex_jobs AS job
         LEFT JOIN web_sales_ai_analyses AS analysis ON analysis.job_id = job.id
        WHERE job.idempotency_key = $1`,
      [idempotencyKey],
    );
    const prior = existing.rows[0];
    if (prior) {
      if (
        prior.parameters.inputHash !== input.packetHash
        || prior.parameters.resultHash !== resultHash
        || !prior.analysis_id
        || !prior.version
        || !prior.status
      ) throw new DirectAnalysisConflict("同じ保存IDに別の分析結果が登録されています");
      await client.query("COMMIT");
      return {
        status: prior.status, analysisId: prior.analysis_id, jobId: prior.id,
        version: prior.version, tsgPostStatus: "skipped", duplicate: true,
      };
    }

    const active = await client.query(
      `SELECT id FROM web_sales_codex_jobs
        WHERE task_key = 'web_sales_analysis' AND report_month = $1::date
          AND period_start = $2::date AND period_end = $3::date
          AND status IN ('queued', 'running') LIMIT 1`,
      [`${input.month}-01`, period.startDate, period.endDate],
    );
    if (active.rowCount) throw new DirectAnalysisConflict("同じ月のBridge分析が実行待ちまたは実行中です");

    const latest = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::integer AS version FROM web_sales_ai_analyses
        WHERE report_month = $1::date AND analysis_type = 'monthly'`,
      [`${input.month}-01`],
    );
    const version = Number(latest.rows[0]?.version || 0) + 1;
    const jobParameters = {
      taskKey: "web_sales_analysis", analysisType: "monthly",
      executionPolicy: "codex_desktop_direct", model: input.model,
      inputHash: input.packetHash, resultHash, requestId: input.requestId,
      tsgPostStatus: "skipped",
    };
    const job = await client.query<{ id: string }>(
      `INSERT INTO web_sales_codex_jobs
        (task_key, channel, trigger_type, period_start, period_end, report_month,
         status, progress, current_step, parameters, requested_by, idempotency_key,
         started_at, completed_at)
       VALUES ('web_sales_analysis', NULL, 'manual', $1::date, $2::date, $3::date,
               $4, 100, $5, $6::jsonb, $7, $8, now(), now())
       RETURNING id`,
      [period.startDate, period.endDate, `${input.month}-01`, input.data.status,
        "Codexアプリから月次分析を保存しました", JSON.stringify(jobParameters), adminEmail, idempotencyKey],
    );
    const jobId = job.rows[0].id;
    const analysis = await client.query<{ id: string }>(
      `INSERT INTO web_sales_ai_analyses
        (job_id, report_month, period_start, period_end, analysis_type, version,
         model, status, executive_summary, sales_analysis, expense_analysis,
         floor_staff_summary, actions, risks, data_quality, input_snapshot,
         raw_result, created_by, tsg_post_status)
       VALUES ($1, $2::date, $3::date, $4::date, 'monthly', $5,
               $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
               $14::jsonb, $15::jsonb, $16::jsonb, $17, 'skipped')
       RETURNING id`,
      [jobId, `${input.month}-01`, period.startDate, period.endDate, version,
        input.model, input.data.status, input.data.executive_summary,
        input.data.sales_analysis, input.data.expense_analysis,
        input.data.floor_staff_summary, JSON.stringify(input.data.actions),
        JSON.stringify(input.data.risks), JSON.stringify(input.data.data_quality),
        JSON.stringify(input.packet), JSON.stringify(input.data), adminEmail],
    );
    const analysisId = analysis.rows[0].id;
    await client.query(
      `UPDATE web_sales_codex_jobs SET result = $2::jsonb, updated_at = now() WHERE id = $1`,
      [jobId, JSON.stringify({ source: "codex_desktop_direct", analysisId, version, status: input.data.status })],
    );
    await client.query(
      `INSERT INTO web_sales_codex_job_events (job_id, event_type, message, progress, payload)
       VALUES ($1, 'direct_analysis_saved', $2, 100, $3::jsonb)`,
      [jobId, `${input.month}のCodexアプリ分析 第${version}版を保存しました`, JSON.stringify({ analysisId, version })],
    );
    await client.query("COMMIT");
    return {
      status: input.data.status, analysisId, jobId, version,
      tsgPostStatus: "skipped", duplicate: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

type GlobalWithAnalysisPool = typeof globalThis & { __tsaDirectAnalysisPool?: Pool };

export function getDirectAnalysisPool() {
  const scope = globalThis as GlobalWithAnalysisPool;
  if (!scope.__tsaDirectAnalysisPool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    scope.__tsaDirectAnalysisPool = new PgPool({
      connectionString,
      ssl: connectionString.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30_000,
    });
  }
  return scope.__tsaDirectAnalysisPool;
}
