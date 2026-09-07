import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CARRIER_TASK_KEY = 'carrier_monthly_import';
export const CARRIER_SKILL_CONTRACT = Object.freeze({mode:'preflight_then_codex', skill:'tsa-carrier-shipment-csv'});

export function validateCarrierJob(value) {
  if (!value || value.task_key !== CARRIER_TASK_KEY || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id || '') || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.period || '')) throw new Error('ローカル出荷ジョブの契約が不正です');
  return {id:value.id, task_key:CARRIER_TASK_KEY, period:value.period, parameters:{target:value.period}};
}

export async function loadCarrierAdapter(appDir, executionMode) {
  if (!appDir || executionMode !== 'interactive') return null;
  if (!isAbsolute(appDir)) throw new Error('carrierAppDirは管理者設定の絶対パスが必要です');
  // The module path comes only from trusted local configuration, never from a job.
  const adapter = await import(pathToFileURL(join(appDir, 'scripts', 'carrier-bridge-job.mjs')).href);
  if (typeof adapter.peekCarrierJob !== 'function' || typeof adapter.runCarrierJob !== 'function') throw new Error('出荷Bridgeモジュールの契約が不正です');
  return adapter;
}

export function carrierMonitorPayload(state = {}) {
  const statuses = {queued:'running', running:'running', completed:'completed', needs_operator:'waiting_for_user', failed:'failed', cancelled:'cancelled'};
  const status = statuses[state.status] || 'running';
  // Fixed labels prevent source data or raw AI/browser errors reaching the shared monitor.
  const labels = {running:'出荷CSVを確認・取得・取り込み中', completed:'出荷CSV取り込み完了', waiting_for_user:'出荷画面で停止理由を確認して実行してください', failed:'出荷CSV処理に失敗しました。出荷画面で確認してください', cancelled:'出荷CSV処理を中止しました'};
  return {status, progress: Number.isFinite(state.progress) ? Math.max(0,Math.min(100,state.progress)) : (status === 'running' ? 5 : 100), currentStep:labels[status], summary: status === 'running' ? '' : labels[status]};
}

// A watchdog request is not proof of process exit. Keep the same worker occupied
// until the real child closes, so no cloud browser job can race an orphan.
export async function waitForCarrierChildClose(child, onWait = () => {}) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  onWait();
  await new Promise(resolveClose => child.once('close', resolveClose));
}
