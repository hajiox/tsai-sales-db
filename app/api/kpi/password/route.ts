import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const ok = password && password === process.env.FINANCE_ADMIN_PASSWORD;

  if (!ok) return new NextResponse("Unauthorized", { status: 401 });

  const res = new NextResponse("OK", { status: 200 });
  // 8時間有効。必要に応じて調整してください
  res.headers.append(
    "Set-Cookie",
    `kpi_pass_ok=1; Path=/; Max-Age=${60 * 60 * 8}; HttpOnly; SameSite=Lax; Secure`
  );
  return res;
}
