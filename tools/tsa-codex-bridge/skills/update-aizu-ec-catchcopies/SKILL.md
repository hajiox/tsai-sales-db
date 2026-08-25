---
name: update-aizu-ec-catchcopies
description: TSAが固定した商品識別子とサイト別キャッチコピーを使い、ログイン済み楽天RMSとYahoo!ショッピングの商品キャッチコピー欄だけを安全に確認・変更するCodex Bridge専用Skill。
---

# ECキャッチコピー変更

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

TSAが保存・承認した1商品のキャッチコピーを、指定された楽天またはYahooへ1サイトずつ反映する。Bridgeが現在のサイトだけを `TASK_JSON.targets` と `TASK_JSON.newCatchcopy` に固定して渡す。

## 絶対条件

- `TASK_JSON.targets` の1サイトだけを操作する。
- `TASK_JSON.newCatchcopy` を一字一句そのまま使い、整形、追記、省略、SEO調整をしない。
- `productMappings`、`verifiedProductIdentifiers`、JAN、内容量、保存方法を使って同一商品を確認する。類似商品へ変更しない。
- 変更可能なのはキャッチコピー欄だけ。商品名、価格、セール価格、ポイント、在庫、配送、送料、税、画像、説明、バリエーション、カテゴリ、広告を変更しない。
- 一括選択・一括編集を使わない。
- ログイン、MFA、CAPTCHA、アカウント選択、権限確認が必要なら `waiting_for_user` にする。迂回しない。
- 保存前に現在値が計画時の `observed_catchcopy` または目標値のどちらかであることを確認する。別の値なら上書きせず `blocked`。
- 保存後は再読込または一覧へ戻り、サーバー保存値が目標値と完全一致した場合だけ `updated`。

## Chrome

- ユーザーのログイン済みChromeだけを使う。
- 既存の該当公式管理タブを優先する。使えない場合だけ同じChromeプロファイルに一時タブを1枚開く。
- ユーザー所有タブを閉じない。一時タブだけ処理後に閉じる。
- 別ウィンドウ、別プロファイル、シークレット、別ブラウザを使わない。

## 対象欄

- 楽天: RMSの商品編集にある「キャッチコピー」。商品管理番号を再確認する。87文字以内。
- Yahoo: ストアクリエイターProの商品編集にある「キャッチコピー」。API/CSV上の項目は `headline`。商品コードを再確認し、全角30文字以内、HTMLなし。

Amazon、メルカリShops、BASE、Qoo10、TikTokは専用キャッチコピー欄の対象外であり操作しない。

## 読取計画

外部データを変更しない。対象商品の現在の保存値と確定識別子を読み、`planned`、`not_found`、`blocked` の計画JSONを返す。確定識別子がある場合は名称検索だけで見つからなくても `not_found` にせず識別子ルートを試す。

## 書込

`PLAN_JSON` の1サイトだけを処理する。現在値が目標値なら保存せず検証完了、現在値が計画値ならキャッチコピー欄だけを変更して保存、その他なら停止する。画面変更時は目的と禁止事項を守る範囲で公式の別ルートを判断してよい。同じ修復経路は2回まで。

## 結果

指定されたJSON Schemaだけを返す。推測で成功扱いにしない。
