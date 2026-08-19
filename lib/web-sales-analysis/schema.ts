import { z } from "zod";

export const webSalesAnalysisActionSchema = z.object({
  priority: z.number().int().min(1).max(5),
  area: z.enum(["sales", "product", "channel", "advertising", "fees", "data"]),
  title: z.string().min(1).max(160),
  rationale: z.string().min(1).max(3000),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(8),
  expected_impact: z.string().min(1).max(1000),
  deadline: z.string().min(1).max(100),
  metric: z.string().min(1).max(500),
  stop_condition: z.string().min(1).max(800),
  confidence: z.enum(["high", "medium", "low"]),
});

export const webSalesAnalysisRiskSchema = z.object({
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(6),
});

export const webSalesAnalysisResultSchema = z.object({
  status: z.enum(["completed", "needs_review"]),
  executive_summary: z.string().min(1).max(8000),
  sales_analysis: z.string().min(1).max(20000),
  expense_analysis: z.string().min(1).max(20000),
  floor_staff_summary: z.string().min(1).max(800),
  actions: z.array(webSalesAnalysisActionSchema).min(3).max(12),
  risks: z.array(webSalesAnalysisRiskSchema).max(10),
  data_quality: z.object({
    grade: z.enum(["A", "B", "C", "D"]),
    summary: z.string().min(1).max(2000),
    limitations: z.array(z.string().min(1).max(500)).max(12),
  }),
});

export type WebSalesAnalysisResult = z.infer<typeof webSalesAnalysisResultSchema>;
export type WebSalesAnalysisAction = z.infer<typeof webSalesAnalysisActionSchema>;
export type WebSalesAnalysisRisk = z.infer<typeof webSalesAnalysisRiskSchema>;
