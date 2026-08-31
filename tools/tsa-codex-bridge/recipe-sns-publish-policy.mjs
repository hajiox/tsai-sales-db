export const RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE =
  "対話中のCodexで画像アップロードと最終投稿を承認してください。未投稿の媒体だけを再開できます。";

const BROWSER_APPROVAL_WAIT_PATTERN =
  /browser security check was unavailable|permission request was dismissed before a decision was made/i;
const STORY_NATIVE_FILE_PICKER_PATTERN =
  /timed out[^\n]*waiting for file chooser|os(?:の)?ファイル選択|native file picker/i;

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
    evidence: platform === "instagram_story"
      ? "Meta Business Suiteの画像追加がOSファイル選択を要求したため、非対話Bridgeでは公開前に停止しました。"
      : "Chromeの画像アップロード確認を非対話Bridgeから完了できないため、公開前に停止しました。",
    message: RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE,
    approvalWait: true,
  };
}
