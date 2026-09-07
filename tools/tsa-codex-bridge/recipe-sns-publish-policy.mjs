export const RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE =
  "Bridgeのブラウザー確認が完了しませんでした。公開状態を確認し、未投稿の媒体だけをTSAから再実行してください。";

const BROWSER_APPROVAL_WAIT_PATTERN =
  /browser security check was unavailable|permission request was dismissed before a decision was made/i;
const STORY_NATIVE_FILE_PICKER_PATTERN =
  /os(?:の)?ファイル選択|native file picker/i;

export function isRecipeSnsInteractiveApprovalWait(platform, ...values) {
  const text = values.map((value) => String(value || "")).join("\n");
  if (BROWSER_APPROVAL_WAIT_PATTERN.test(text)) return true;
  return platform === "instagram_story" && STORY_NATIVE_FILE_PICKER_PATTERN.test(text);
}

export function normalizeRecipeSnsPublishStop({ platform, status, evidence, message }) {
  const approvalWait = !new Set(["published", "already_published"]).has(status)
    && isRecipeSnsInteractiveApprovalWait(platform, evidence, message);
  if (!approvalWait) {
    return { status, evidence, message, approvalWait: false };
  }
  return {
    status: "blocked",
    evidence: platform === "instagram_story" && STORY_NATIVE_FILE_PICKER_PATTERN.test(`${evidence}\n${message}`)
      ? "Meta Business Suiteの画像追加がOSファイル選択を要求したため、BridgeではOS操作を行わず停止しました。"
      : "Chromeのブラウザー確認が中止または未完了となったため、投稿結果の確認が必要です。",
    message: RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE,
    approvalWait: true,
  };
}
