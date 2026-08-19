import "server-only";

import type { CharSiuMaterialKey } from "@/lib/char-siu-production";

export const DELIVERY_NOTE_MATERIALS: Array<{
  key: Extract<CharSiuMaterialKey, "pork_belly" | "green_onion" | "ginger">;
  name: string;
  aliases: string[];
}> = [
  { key: "pork_belly", name: "豚バラ肉", aliases: ["豚バラ", "豚バラ肉", "バラ肉", "豚肉"] },
  { key: "green_onion", name: "ネギ", aliases: ["ネギ", "ねぎ", "長ねぎ", "長葱"] },
  { key: "ginger", name: "生姜", aliases: ["生姜", "しょうが", "ショウガ"] },
];

export type DeliveryNoteExtractedItem = {
  materialKey: "pork_belly" | "green_onion" | "ginger";
  materialName: string;
  sourceItemName: string;
  purchaseUnitQuantityG: number;
  purchasePriceTaxIncluded: number;
  taxRate: number;
  confidence: number;
  evidence: string;
};

export type DeliveryNoteScanSource = "mobile_qr" | "doc_scanner" | "direct_upload";

type DeliveryNoteScanRecord = {
  id: string;
  status: string;
  document_date?: string | null;
  target_production_date?: string | null;
  source_kind?: string | null;
  doc_scanner_doc_id?: string | null;
  file_names?: string[] | null;
  extracted_items?: unknown;
  created_at?: string | null;
};

export function normalizeDeliveryNoteItems(value: unknown): DeliveryNoteExtractedItem[] {
  if (!Array.isArray(value)) return [];
  const normalized = new Map<string, DeliveryNoteExtractedItem>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const definition = DELIVERY_NOTE_MATERIALS.find((item) => item.key === raw.material_key);
    const quantity = Number(raw.purchase_unit_quantity_g);
    const taxRate = normalizeTaxRate(raw.tax_rate);
    const includedPrice = Number(raw.purchase_price_tax_included);
    const excludedPrice = Number(raw.purchase_price_tax_excluded);
    const price = Number.isFinite(includedPrice) && includedPrice > 0
      ? includedPrice
      : excludedPrice * (1 + taxRate);
    if (!definition || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const candidate: DeliveryNoteExtractedItem = {
      materialKey: definition.key,
      materialName: definition.name,
      sourceItemName: String(raw.source_item_name || definition.name).trim().slice(0, 120),
      purchaseUnitQuantityG: round(quantity, 4),
      purchasePriceTaxIncluded: round(price, 4),
      taxRate,
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      evidence: String(raw.evidence || "").trim().slice(0, 300),
    };
    const current = normalized.get(definition.key);
    if (!current || candidate.confidence > current.confidence) normalized.set(definition.key, candidate);
  }
  return DELIVERY_NOTE_MATERIALS
    .map((definition) => normalized.get(definition.key))
    .filter((item): item is DeliveryNoteExtractedItem => Boolean(item));
}

export function isCompleteDeliveryNoteScan(items: DeliveryNoteExtractedItem[]) {
  return DELIVERY_NOTE_MATERIALS.every((definition) => (
    items.some((item) => item.materialKey === definition.key && item.purchasePriceTaxIncluded > 0)
  ));
}

export function publicDeliveryNoteScan(scan: DeliveryNoteScanRecord) {
  const items = normalizeDeliveryNoteItems(scan.extracted_items);
  return {
    id: scan.id,
    status: scan.status,
    documentDate: scan.document_date || null,
    targetProductionDate: scan.target_production_date || null,
    sourceKind: normalizeSourceKind(scan.source_kind),
    fileNames: scan.file_names || [],
    items: DELIVERY_NOTE_MATERIALS.map((definition) => {
      const item = items.find((candidate) => candidate.materialKey === definition.key);
      return {
        key: definition.key,
        name: definition.name,
        recognized: Boolean(item),
        sourceItemName: item?.sourceItemName || null,
        confidence: item?.confidence ?? null,
      };
    }),
  };
}

export function adminDeliveryNoteScan(scan: DeliveryNoteScanRecord) {
  const items = normalizeDeliveryNoteItems(scan.extracted_items);
  return {
    id: scan.id,
    status: scan.status,
    documentDate: scan.document_date || null,
    targetProductionDate: scan.target_production_date || null,
    sourceKind: normalizeSourceKind(scan.source_kind),
    docScannerDocId: scan.doc_scanner_doc_id || null,
    fileNames: scan.file_names || [],
    createdAt: scan.created_at || null,
    items: DELIVERY_NOTE_MATERIALS.map((definition) => {
      const item = items.find((candidate) => candidate.materialKey === definition.key);
      return {
        key: definition.key,
        name: definition.name,
        recognized: Boolean(item),
        sourceItemName: item?.sourceItemName || null,
        purchaseUnitQuantityG: item?.purchaseUnitQuantityG ?? null,
        purchasePriceTaxIncluded: item?.purchasePriceTaxIncluded ?? null,
        taxRate: item?.taxRate ?? 0.08,
        confidence: item?.confidence ?? null,
        evidence: item?.evidence || null,
      };
    }),
  };
}

function normalizeSourceKind(value: unknown): DeliveryNoteScanSource {
  if (value === "mobile_qr" || value === "doc_scanner") return value;
  return "direct_upload";
}

function normalizeTaxRate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.08;
  if (number > 1) return number / 100;
  return Math.max(0, number);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
