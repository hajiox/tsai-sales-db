const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const api = read("app", "api", "recipe", "[id]", "sns-publications", "route.ts");
const completionApi = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts");
const panel = read("app", "recipe", "_components", "RecipeSnsPublishPanel.tsx");
const studio = read("app", "recipe", "_components", "RecipeSnsStudio.tsx");
const policy = read("lib", "recipe-sns-publish.ts");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const prelogin = bridge.slice(bridge.indexOf("const HEADLESS_SAFE_TASK_KEYS"), bridge.indexOf("mkdirSync(LOG_DIR"));
const schema = JSON.parse(read("tools", "tsa-codex-bridge", "recipe-sns-publish-result.schema.json"));
const skill = read("tools", "tsa-codex-bridge", "skills", "publish-aizu-sns-posts", "SKILL.md");
const platformReference = read("tools", "tsa-codex-bridge", "skills", "publish-aizu-sns-posts", "references", "platforms.md");
const version = read("lib", "web-sales-codex", "bridge-version.ts");

assert.match(api, /ADMIN_EMAIL = "aizubrandhall@gmail\.com"/);
assert.match(api, /buildRecipeSnsPublishSnapshot/);
assert.match(api, /createHash\("sha256"\)/);
assert.match(api, /enqueue_recipe_sns_publication/);
assert.match(api, /cancel_recipe_sns_publication/);
assert.match(api, /MAX_SCHEDULE_DAYS = 180/);
assert.match(api, /const generationId =/);
assert.match(api, /normalizeRecipeSnsPublishPosts\(body\.posts/);
assert.match(api, /p_scheduled_at: scheduledAt/);
assert.match(api, /cleanupMalformedOwnAttemptAuthorized !== true/);
assert.match(completionApi, /complete_recipe_sns_publish_job/);
assert.match(completionApi, /validateRecipeSnsPublishResult/);

for (const text of ["今すぐ投稿", "日時予約", "全SNSへ投稿", "全SNSを予約", "取消", "@Aizu_Brand_Kan", "@aizubrandhall"]) {
  assert.ok(panel.includes(text), `missing SNS publish UI: ${text}`);
}
assert.match(panel, /RECIPE_SNS_PLATFORMS\.map/);
assert.match(panel, /1媒体で止まっても残りは続行/);
assert.match(panel, /不完全投稿だけを自動削除/);
assert.match(panel, /cleanupMalformedOwnAttemptAuthorized: true/);
assert.match(studio, /<RecipeSnsPublishPanel/);

assert.match(policy, /RECIPE_SNS_EXPECTED_ACCOUNTS/);
assert.match(policy, /validateRecipeSnsPublishResult/);
assert.match(policy, /serializeRecipeSnsPublishResult/);
assert.match(bridge, /job\.task_key === "recipe_sns_publish"/);
assert.match(bridge, /executeRecipeSnsPublishJob/);
assert.match(bridge, /recipeSnsPublishProtocolVersion: 1/);
assert.match(bridge, /Use \$publish-aizu-sns-posts/);
assert.match(bridge, /exactly one SNS target/);
assert.match(bridge, /isAllowedRecipeSnsPublishCommand/);
assert.match(bridge, /実際の公開結果は保持しています/);
assert.match(bridge, /BEGIN_PUBLISH_SKILL/);
assert.match(bridge, /BEGIN_CHROME_CONTROL_SKILL/);
assert.match(bridge, /resolveChromeControlSkillBundle/);
assert.match(bridge, /browser-client\.mjs/);
assert.match(bridge, /for \(const \[index, platform\] of parameters\.targets\.entries\(\)\)/);
assert.match(bridge, /targets: \[platform\]/);
assert.match(bridge, /one_fresh_skill_session_per_platform/);
assert.match(bridge, /OPERATOR AUTHORIZATION: the authenticated TSA administrator explicitly confirmed/);
assert.match(bridge, /cleanupMalformedOwnAttemptAuthorized !== true/);
assert.match(bridge, /isRecipeSnsPublishCapacityError/);
assert.match(bridge, /recipe_sns_publish_capacity_retry/);
assert.match(bridge, /Meta Business Suite.*same single Instagram Story target/);
assert.doesNotMatch(prelogin, /recipe_sns_publish/);
assert.match(installer, /"recipe-sns-publish-result\.schema\.json"/);
assert.match(installer, /Copy-Item[^\n]*recipe-sns-publish-result\.schema\.json/);
assert.equal(schema.properties.platforms.maxItems, 4);

assert.match(skill, /fresh, non-resumed `codex exec`/);
assert.match(skill, /Never open, read, search, or reuse app Chats/);
assert.match(skill, /必ず1媒体だけ/);
assert.match(skill, /1媒体＝1つの新規Codexセッション/);
assert.match(skill, /playwright.*直接import/);
assert.match(skill, /リンク.*スタンプ|リンク.*ステッカー/);
assert.match(skill, /同じ失敗経路を反復しない/);
assert.match(skill, /投稿ボタンは媒体ごとに最大1回/);
assert.match(skill, /chooserOutcomePromise = tab\.playwright\.waitForEvent\("filechooser", \{ timeoutMs: 10000 \}\)\.then/);
assert.match(skill, /input\[type="file"\]/);
assert.match(skill, /待機失敗を未処理のままにしてブラウザー接続を失わない/);
assert.match(skill, /タイムアウトしただけでは.*許可が無効とは断定しない/);
assert.match(skill, /別のChrome制御セッションが使用中でclaimできない/);
assert.match(skill, /固定本文と完全一致する下書き/);
assert.match(skill, /この実行が作成したと証明できる不完全投稿/);
assert.match(platformReference, /表示ボタンのクリックだけではfile chooserが開かない場合がある/);
assert.match(platformReference, /未処理rejectを発生させない/);
assert.match(platformReference, /公式Meta Business Suiteの一時タブを1枚だけ開く/);
assert.match(platformReference, /Meta Business SuiteはIGストーリー投稿の明示承認済み公式経路/);

const bridgeVersion = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.equal(version.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], bridgeVersion);

console.log(`Recipe SNS publication feature and Bridge ${bridgeVersion} contracts verified.`);
