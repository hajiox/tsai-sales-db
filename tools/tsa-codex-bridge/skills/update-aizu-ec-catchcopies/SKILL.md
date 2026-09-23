---
name: update-aizu-ec-catchcopies
description: TSAが固定した商品識別子と共通キャッチコピーを使い、ログイン済み楽天RMSとYahoo!ショッピングへ一字一句同じ文言を安全に反映するCodex Bridge専用Skill。
---

## Browser route order (2026-09-21)

Chrome連係 → Chrome DevTools MCP → 最後にPC操作。同じ未完了の工程をこの順で進める。最初の接続・操作手段が失敗しただけで終了しない。以前の参照資料にある単一ツール限定・接続失敗時の即停止指示より、この順序を優先する。各段階で同じ失敗への根拠ある再試行は1回まで。投稿等の成否不明時は先に結果を確認し、完了済み操作を重複させない。実際のログイン・MFA・CAPTCHA・必須許可待ちは迂回しない。PC操作も利用不可なら、各手段の制約と残った操作を明示する。


# ECキャッチコピー変更

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

TSAが保存・承認した1商品の共通キャッチコピーを、指定された楽天またはYahooへ1サイトずつ反映する。Bridgeが現在のサイトだけを `TASK_JSON.targets` に固定し、両サイト共通の値を `TASK_JSON.newCatchcopy` として渡す。

## 絶対条件

- `TASK_JSON.targets` の1サイトだけを操作する。
- `TASK_JSON.newCatchcopy` は楽天・Yahoo共通の確定値である。一字一句そのまま使い、サイト別の整形、追記、省略、SEO調整をしない。
- 互換用の `catchcopies` がある場合も、楽天・Yahooの値が共通値と完全一致していなければ停止する。
- `productMappings`、`verifiedProductIdentifiers`、JAN、内容量、保存方法を使って同一商品を確認する。類似商品へ変更しない。
- 変更可能なのはキャッチコピー欄だけ。商品名、価格、セール価格、ポイント、在庫、配送、送料、税、画像、説明、バリエーション、カテゴリ、広告を変更しない。
- 一括選択・一括編集を使わない。
- ログイン、MFA、CAPTCHA、アカウント選択、権限確認が必要なら `waiting_for_user` にする。迂回しない。
- 認証・権限画面は1回確認した時点で停止する。再読込、再ログイン、別経路探索を反復せず、直ちに `waiting_for_user` を返す。
- 保存前に現在値が計画時の `observed_catchcopy` または目標値のどちらかであることを確認する。別の値なら上書きせず `blocked`。
- 保存後は再読込または一覧へ戻り、サーバー保存値が目標値と完全一致した場合だけ `updated`。

## Chrome

- ユーザーのログイン済みChromeだけを使う。
- 既存の該当公式管理タブを優先する。使えない場合だけ同じChromeプロファイルに一時タブを1枚開く。
- ユーザー所有タブを閉じない。一時タブだけ処理後に閉じる。
- 別ウィンドウ、別プロファイル、シークレット、別ブラウザを使わない。

## 対象欄

- 楽天: RMSの商品編集にある「キャッチコピー」。商品管理番号を再確認する。共通上限30文字以内。
- Yahoo: ストアクリエイターProの商品編集にある「キャッチコピー」。API/CSV上の項目は `headline`。商品コードを再確認し、全角30文字以内、HTMLなし。

Amazon、メルカリShops、BASE、Qoo10、TikTokは専用キャッチコピー欄の対象外であり操作しない。

## 読取計画

外部データを変更しない。対象商品の現在の保存値と確定識別子を読み、`planned`、`not_found`、`blocked` の計画JSONを返す。確定識別子がある場合は名称検索だけで見つからなくても `not_found` にせず識別子ルートを試す。

## 書込

`PLAN_JSON` の1サイトだけを処理する。現在値が目標値なら保存せず検証完了、現在値が計画値ならキャッチコピー欄だけを変更して保存、その他なら停止する。画面変更時は目的と禁止事項を守る範囲で公式の別ルートを判断してよい。同じ修復経路は2回まで。

## 結果

指定されたJSON Schemaだけを返す。推測で成功扱いにしない。

## 作業完了後のタブ整理

開始時の既存タブと、このジョブが作成した作業用タブのIDを区別して記録する。取得・登録・更新・投稿の最終確認後、結果JSONを返す前に、このジョブが作成して不要になったタブをブラウザの文書化されたAPIで閉じ、一覧で閉鎖を確認する。既存のユーザー所有タブ、別ジョブのタブ、未確定の送信画面は閉じない。ログイン・MFA・許可待ちはユーザーが操作するタブだけ保持する。閉鎖APIが利用不可・拒否された場合は結果messageへ理由を記録し、業務操作をやり直さない。Chrome全体やプロセスを終了しない。
