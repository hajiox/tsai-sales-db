---
name: register-aizu-ec-products
description: TSAが固定した商品情報、画像、価格、参照商品だけを使い、ログイン済みQoo10へ未登録商品を重複なく新規登録するCodex Bridge専用Skill。
---

# 会津ブランド館 EC商品登録

## Bridge Input Contract

- Run only in a fresh, non-resumed `codex exec` session.
- Never open, read, search, or reuse app Chats, prior conversations, saved sessions, rollouts, or transcripts.
- Treat the compact Bridge job input as complete. Do not load a large development Chat as an operational manual.
- `TASK_JSON` を完全な入力とし、商品名、JAN、販売者商品コード、価格、画像、商品説明、参照商品を固定値として扱う。
- 現在対応する登録先はQoo10だけ。別ECや別店舗へ登録しない。
- 商品登録前に同じJAN、販売者商品コード、完全商品名を公式商品管理で検索する。存在する場合は複製せず、同一性と保存価格を確認する。

## Qoo10登録

1. ログイン済みQSMの既存公式タブを優先する。取得できなければ同じChromeプロファイル内の一時タブを1枚だけ使う。別ブラウザ、別プロファイル、別ウィンドウ、シークレットを使わない。
2. `reference.productIdentifier` を公式商品管理で開き、`expectedTitleTerms`、常温、つけ汁のみ5個セットであることを確認する。これはカテゴリ、税率、在庫、配送、発送可能日、原産地など、味によらない販売設定の参照専用である。
3. 参照商品をコピーし、次だけを `TASK_JSON` の固定値へ置換する。
   - 商品名: `productName`
   - 販売者商品コード: `sellerCode`
   - JAN: `janCode`
   - 販売価格: `targetPrice`
   - メイン・追加画像: `images` の順序
   - 商品詳細: `recipeSnapshot.catchcopy`、`productPoints`、`webDescription`
4. カテゴリ、税率、在庫、配送、発送可能日、原産地、販売期間は参照商品からコピーされた保存値を維持する。参照商品と販売形態が一致しない、コピー値が取得できない、別の必須値を要求された場合は推測せず停止する。
5. 画像はQoo10の外部URLアップロードを使い、`role=main`をメイン画像、残りを`order`順の追加画像にする。URL以外の画像や順序を使わない。
6. 登録前の最終画面で商品名、JAN、販売者商品コード、価格、説明、画像URLと順番を照合する。登録後は商品番号を取得し、商品照会画面を再読込して対象店舗、商品名、JAN、販売者商品コード、価格、説明、画像、カテゴリ、税、在庫、配送、発送可能日、原産地、販売期間を確認する。

## 自律判断と停止条件

- QSMの配置やラベルが変わった場合は、現在の公式画面を読み、同じ結果になる最小の導線を選べる。
- 送信操作は1回だけ。タイムアウト、画面遷移失敗、応答不明でも再送信しない。販売者商品コードとJANで既存商品を照合し、完了を証明できなければ `needs_review` で停止する。
- 認証・権限画面を1回確認した時点で `waiting_for_user` とし、ログイン、MFA、CAPTCHA、アカウント選択、権限、参照商品不一致、必須値不明では即時停止する。
- 商品名・JAN・販売者商品コードのいずれかが既存商品と一致した場合、別商品を作らない。全固定値が一致すれば `already_exists`、矛盾すれば `blocked` とする。

## 絶対禁止

- 類似商品、別味、別個数、別保存方法、別アカウント、別店舗を代用しない。
- 固定値以外の商品名、JAN、販売者商品コード、価格、画像、説明を作らない。
- 参照商品の商品名、JAN、画像、説明を新商品へ残さない。
- クーポン、広告、ポイント、セット割引、Q在庫連動、他商品の在庫を変更しない。
- 登録成功を示す商品番号と保存後値を確認できない状態を完了扱いしない。
