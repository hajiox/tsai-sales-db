import assert from "node:assert/strict";
import {
  RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE,
  isRecipeSnsInteractiveApprovalWait,
  normalizeRecipeSnsPublishStop,
} from "../tools/tsa-codex-bridge/recipe-sns-publish-policy.mjs";

const approvalMessages = [
  "permission request was dismissed before a decision was made",
  "browser security check was unavailable",
];

for (let run = 0; run < 20; run += 1) {
  for (const raw of approvalMessages) {
    assert.equal(isRecipeSnsInteractiveApprovalWait("x", raw), true);
    assert.deepEqual(normalizeRecipeSnsPublishStop({
      platform: "x",
      status: "failed",
      evidence: raw,
      message: "画像を設定できませんでした",
    }), {
      status: "blocked",
      evidence: "Chromeの画像アップロード確認を非対話Bridgeから完了できないため、公開前に停止しました。",
      message: RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE,
      approvalWait: true,
    });
  }
  assert.equal(isRecipeSnsInteractiveApprovalWait(
    "instagram_story",
    "Timed out after 3000ms waiting for file chooser.",
  ), true);
  assert.equal(isRecipeSnsInteractiveApprovalWait(
    "instagram",
    "Timed out after 3000ms waiting for file chooser.",
  ), false);
  assert.deepEqual(normalizeRecipeSnsPublishStop({
    platform: "threads",
    status: "failed",
    evidence: "画像形式が不正です",
    message: "JPEGを確認してください",
  }), {
    status: "failed",
    evidence: "画像形式が不正です",
    message: "JPEGを確認してください",
    approvalWait: false,
  });
}

console.log("recipe SNS publish approval policy: 20 repeat runs passed");
