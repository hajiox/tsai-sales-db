import "server-only";

import { createClient } from "@supabase/supabase-js";

type EmployeeRow = {
  id: string;
  payroll_status: string;
  hire_date: string | null;
  resigned_date: string | null;
};

type ProfileRow = {
  employee_id: string;
  effective_from: string;
  effective_to: string | null;
  calculation_type: string;
  monthly_base_amount: number | string | null;
  hourly_rate: number | string | null;
  overtime_divisor: number | string | null;
};

export type ManufacturingLaborRate = {
  hourlyRate: number;
  staffCount: number;
  excludedCount: number;
  effectiveDate: string;
  syncedAt: string;
  source: "tsg_manufacturing_average";
};

export async function fetchManufacturingAverageHourlyRate(
  effectiveDate: string,
): Promise<ManufacturingLaborRate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new Error("製造日の形式が不正です");
  }

  const url = process.env.TSG_SUPABASE_URL?.trim();
  const key = process.env.TSG_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("TSG給与連携が設定されていません");

  const tsg = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: employeeRows, error: employeeError } = await tsg
    .from("gw_payroll_employees")
    .select("id,payroll_status,hire_date,resigned_date")
    .eq("department", "製造");
  if (employeeError) throw new Error(`TSG製造スタッフ取得エラー: ${employeeError.message}`);

  const employees = ((employeeRows || []) as EmployeeRow[]).filter((employee) => (
    employee.payroll_status !== "inactive"
    && (!employee.hire_date || employee.hire_date <= effectiveDate)
    && (!employee.resigned_date || employee.resigned_date >= effectiveDate)
  ));
  if (employees.length === 0) throw new Error("TSGに対象日の製造スタッフが登録されていません");

  const { data: profileRows, error: profileError } = await tsg
    .from("gw_payroll_calculation_profiles")
    .select("employee_id,effective_from,effective_to,calculation_type,monthly_base_amount,hourly_rate,overtime_divisor")
    .in("employee_id", employees.map((employee) => employee.id))
    .lte("effective_from", effectiveDate)
    .order("effective_from", { ascending: false });
  if (profileError) throw new Error(`TSG給与プロファイル取得エラー: ${profileError.message}`);

  const applicableProfiles = new Map<string, ProfileRow>();
  for (const profile of (profileRows || []) as ProfileRow[]) {
    if (profile.effective_to && profile.effective_to < effectiveDate) continue;
    if (!applicableProfiles.has(profile.employee_id)) applicableProfiles.set(profile.employee_id, profile);
  }

  const hourlyRates: number[] = [];
  let excludedCount = 0;
  for (const employee of employees) {
    const profile = applicableProfiles.get(employee.id);
    const rate = profile ? hourlyRateFromProfile(profile) : null;
    if (rate === null) {
      excludedCount += 1;
      continue;
    }
    hourlyRates.push(rate);
  }
  if (hourlyRates.length === 0) {
    throw new Error("TSGの製造スタッフに有効な時間単価がありません");
  }

  return {
    hourlyRate: round(hourlyRates.reduce((sum, rate) => sum + rate, 0) / hourlyRates.length, 2),
    staffCount: hourlyRates.length,
    excludedCount,
    effectiveDate,
    syncedAt: new Date().toISOString(),
    source: "tsg_manufacturing_average",
  };
}

function hourlyRateFromProfile(profile: ProfileRow) {
  if (profile.calculation_type === "hourly") {
    const hourlyRate = finitePositive(profile.hourly_rate);
    return hourlyRate;
  }
  if (profile.calculation_type === "monthly_fixed" || profile.calculation_type === "monthly_with_overtime") {
    const monthlyBase = finitePositive(profile.monthly_base_amount);
    const divisor = finitePositive(profile.overtime_divisor);
    return monthlyBase && divisor ? monthlyBase / divisor : null;
  }
  return null;
}

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
