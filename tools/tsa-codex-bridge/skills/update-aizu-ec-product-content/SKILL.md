---
name: update-aizu-ec-product-content
description: TSAが固定した商品識別子、商品ポイント、Web商品説明を使い、ログイン済みAmazon、楽天、Yahoo、メルカリShops、BASE、Qoo10、TikTokへ安全に反映するCodex Bridge専用Skill。
---

# EC商品ポイント・商品説明反映

## Bridge Input Contract

- Run only through a fresh, non-resumed `codex exec`.
- Never open, read, search, or reuse app Chats, past tasks, threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete operational context.
- Freshかつ非再開の `codex exec` でのみ実行する。巨大な過去Chatを含むアプリ内Chat、過去タスク、スレッド、会話履歴、transcript、rollout、保存済みsessionを開かない・検索しない・再利用しない。
- Bridgeが渡す小さな `TASK_JSON` と `PLAN_JSON` を完全な入力として扱う。このSkillが明示した情報以外を探さない。

## 目的

TSA管理者が保存・確認した1商品の商品ポイントとWeb商品説明を、Bridgeが固定した1サイトだけへ反映する。処理対象は必ず `TASK_JSON.targets` の1件である。

## 絶対条件

- `TASK_JSON.targetContent` を確定値として使い、要約、SEO調整、追記、省略、言い換えをしない。
- Amazonは `fieldLayout=separate` とし、商品ポイントを「商品の仕様・特長」等の複数のbullet欄へ1行ずつ、Web商品説明を商品説明欄へ別々に登録する。
- Amazon以外は `fieldLayout=combined` とし、同一の商品説明欄へ商品ポイントを上、空行、Web商品説明を下の順で登録する。
- 楽天とYahooは `markerStyle=square` の `■` 版を一字一句使う。絵文字 `✅️` を登録しない。
- Amazon、メルカリShops、BASE、Qoo10、TikTokは `markerStyle=check` の `✅️` 版を一字一句使う。
- `productMappings`、`verifiedProductIdentifiers`、JAN、内容量、保存方法を使って同一商品を確認する。類似商品へ変更しない。
- 変更可能なのは商品ポイント欄と商品説明欄だけ。商品名、キャッチコピー、価格、セール価格、ポイント施策、在庫、配送、送料、税、画像、カテゴリ、バリエーション、広告を変更しない。
- 一括選択・一括編集を使わない。
- ログイン、MFA、CAPTCHA、アカウント選択、権限確認が必要なら `waiting_for_user` にする。迂回しない。
- 認証・権限画面は1回確認した時点で停止する。再読込、再ログイン、別経路探索を反復せず、直ちに `waiting_for_user` を返す。
- 保存前に現在値が `PLAN_JSON` の観測値または目標値のどちらかであることを確認する。別の値なら上書きせず `blocked`。
- 保存後に再読込または一覧へ戻り、保存値または表示本文が目標と完全一致した場合だけ `updated`。HTMLエディタではタグではなく改行を含む表示テキストを比較する。

## Chrome

- ユーザーのログイン済みChromeだけを使う。既存の該当公式管理タブを優先する。
- 既存タブが使えない場合だけ同じChromeプロファイルに一時タブを1枚開ける。
- ユーザー所有タブを閉じない。一時タブだけ処理後に閉じる。
- 別ウィンドウ、別プロファイル、シークレット、別ブラウザを使わない。

## 読取計画

外部データを変更しない。対象商品の現在の保存値、欄構成、確定識別子を読み、`planned`、`not_found`、`blocked` の計画JSONを返す。確定識別子がある場合は名称検索だけで見つからなくても `not_found` にせず、識別子ルートを試す。

## 書込

`PLAN_JSON` の1サイトだけを処理する。現在値が目標値なら保存せず検証完了、計画時の値なら許可欄だけを変更・保存、それ以外なら停止する。画面が変わっていても目的、固定値、禁止事項を守る範囲で公式の別ルートを判断してよい。同じ修復経路は2回までとする。

## 結果

指定JSON Schemaだけを返す。推測で成功扱いにしない。Amazonは別欄2種、その他は結合済み本文の最終値を返す。
