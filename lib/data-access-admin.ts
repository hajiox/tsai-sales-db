import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const DATA_RESOURCES = ["recipes", "ingredients", "materials", "expenses", "reviews", "sales"] as const;
export const DATA_SCOPES = [
  "business:full",
  ...DATA_RESOURCES.map(resource => `${resource}:read`),
  ...["recipes", "ingredients", "materials", "expenses"].map(resource => `${resource}:write`),
];
export const DATA_RESOURCE_LABELS: Record<string, string> = {
  recipes: "レシピ", ingredients: "食材", materials: "資材", expenses: "経費", reviews: "レビュー", sales: "WEB売上",
};

export async function dataAccessAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === "aizubrandhall@gmail.com" ? session.user.email : null;
}

export function dataAccessAdminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isDataAccessAdminOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isDataAccessId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

export function validateDataConnectionPermissions(body: Record<string, unknown>) {
  if (!Array.isArray(body.scopes) || !body.scopes.length || body.scopes.length > DATA_SCOPES.length || body.scopes.some(scope => typeof scope !== "string" || !DATA_SCOPES.includes(scope))) throw new Error("許可する操作を選んでください");
  const scopes = body.scopes as string[];
  if (scopes.some(scope => scope.endsWith(":write") && !scopes.includes(scope.replace(/:write$/, ":read")))) throw new Error("更新を許可するデータ種類には閲覧も許可してください");
  const resourceIds = body.resourceIds ?? {};
  if (!resourceIds || typeof resourceIds !== "object" || Array.isArray(resourceIds)) throw new Error("対象IDの制限が正しくありません");
  for (const [resource, ids] of Object.entries(resourceIds)) {
    if (!(DATA_RESOURCES as readonly string[]).includes(resource) || !Array.isArray(ids) || ids.length > 200 || ids.some(id => !isDataAccessId(id))) throw new Error("対象IDはデータ種類ごとにUUIDの配列を指定してください（最大200件）");
  }
  if (scopes.includes("business:full") && Object.keys(resourceIds).length) throw new Error("業務フルアクセスと対象IDの制限は同時に指定できません");
  return { scopes: [...new Set(scopes)], resource_ids: Object.fromEntries(Object.entries(resourceIds).map(([resource, ids]) => [resource, [...new Set((ids as string[]).map(id => id.toLowerCase()))]])) };
}

export function validateDataConnection(body: Record<string, unknown>) {
  if (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 80) throw new Error("接続名は1〜80文字で入力してください");
  const permissions = validateDataConnectionPermissions(body);
  const days = body.expiresInDays ?? 30;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 90) throw new Error("有効期間は1〜90日です");
  const token = `tsa_data_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    connection: {
      id: randomUUID(), label: body.label.trim(), token_hash: createHash("sha256").update(token).digest("hex"),
      ...permissions, max_limit: 50,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    },
  };
}
