---
name: generate-aizu-sns-assets
description: TSAが渡す保存済み商品情報と1枚の参照画像だけを使い、SNS投稿文と通常・広告クリエイティブ・生活シーン画像の媒体別素材を生成するCodex Bridge専用Skill。外部閲覧や投稿は行わない。
---

# 会津ブランド館 SNS素材生成

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. For `creative` and `arrange`, use only that input and the single attached reference image. `normal` intentionally has no attached image because TSA performs the deterministic resize after this run.

## 目的

`TASK_JSON.sourceSnapshot` の固定済みEC商品情報と許可済み商品LP抜粋を分析し、X、Instagram、IGストーリー、Threads向けの投稿文を作る。`TASK_JSON.imageMode` に応じて、同じ4媒体の画像素材も計画または生成する。

## 共通根拠

- 商品の事実は `TASK_JSON.sourceSnapshot` だけを使う。
- `sourceSnapshot.variationKey` を主な訴求軸にし、出力の `variation_key` に完全一致で返す。
- 添付画像は商品の見た目を判断するためだけに使う。画像に写っていない内容や商品仕様を創作しない。
- 商品LPに `warning` がある、または本文が空の場合は推測せず `source_gaps` に記録する。
- 4媒体へ同じ文章を短縮して使い回さず、各媒体の読まれ方に合わせて書き分ける。

## 画像モード

### normal

- ImageGenを呼ばない。
- `generated_images` は4媒体とも `source=original`、`file_path` は空文字にする。
- `creative_overlays` は4媒体とも見出し・補足を空文字、配置を `none` にする。
- TSA側が添付元画像を媒体推奨サイズへ通常リサイズする。

### creative

- 組み込みの画像生成ツールを4媒体について1回ずつ使う。
- 添付画像を各生成の参照画像とし、料理または商品自体の色、形、質感、内容量の印象を忠実に保つ。
- 広告として視線を集める照明と構図にし、商品を隠さない明確な余白を指定する。
- 画像生成には文字、数字、ロゴ、透かしを描かせない。日本語テキストはTSAが後から正確に描画する。
- 各媒体の `creative_overlays` に、入力で根拠がある短い見出し、必要なら補足、画像の余白に合う配置を返す。
- 画像生成ツールが保存した最終画像の絶対パスを、対応する `generated_images.*.file_path` に返す。ツール結果のパスを直接返せない場合だけ、`CODEX_HOME/generated_images` から現在のジョブ作業フォルダへの `Copy-Item` を画像ごとに1回使ってよい。

### arrange

- 組み込みの画像生成ツールを4媒体について1回ずつ使う。
- 添付画像の料理または商品を主役として保ち、実際の食卓、家族の食事、仕事後の一皿、贈り物を開く場面など、商品情報と矛盾しない自然な生活シーンへ配置する。
- 人物を出す場合は商品より目立たせず、顔や著名人、既存キャラクター、第三者ブランドを生成しない。
- 画像内の文字、数字、ロゴ、透かしは禁止する。
- `creative_overlays` は4媒体とも見出し・補足を空文字、配置を `none` にする。
- 画像生成ツールが保存した最終画像の絶対パスを、対応する `generated_images.*.file_path` に返す。ツール結果のパスを直接返せない場合だけ、`CODEX_HOME/generated_images` から現在のジョブ作業フォルダへの `Copy-Item` を画像ごとに1回使ってよい。

## 媒体別画像

- X: 横長16:9。主役の上下を切らず、横方向の環境を広げる。
- Instagram: 正方形1:1。中央付近に主役を置き、一覧で一目で分かる構図にする。
- IGストーリー: 縦長9:16。主役を中央の安全領域へ置き、上下端へ重要部分を寄せない。
- Threads: 横長4:3。会話のきっかけになる自然な生活感を優先する。
- 生成ツールの実寸が指定比率と完全一致しなくてもよい。TSAが最終的に正確な媒体サイズへ変換するため、重要被写体を中央安全領域へ収める。

## 投稿文

- X: 投稿文とハッシュタグを合わせて400文字以内、ハッシュタグ0〜3件。
- Instagram: 投稿文とハッシュタグを合わせて2,200文字以内、ハッシュタグ10〜15件。
- IGストーリー: 50文字以内、ハッシュタグなし。
- Threads: 投稿文とハッシュタグを合わせて500文字以内、ハッシュタグ0〜5件。
- `TASK_JSON.platformRules` の文字数・件数を絶対上限として従う。

## 絶対禁止

- Web検索、ブラウザ操作、外部サイト閲覧、SNS投稿、予約投稿、外部データ変更をしない。
- 過去チャット参照、リポジトリ確認、無関係なファイル探索をしない。
- ソース編集、データベース更新、一般コマンド実行をしない。上記の限定された `Copy-Item` 以外のファイル操作は禁止する。
- 受賞歴、効能、健康効果、人気、ランキング、販売実績、産地、原材料、製法、価格、割引、在庫、期間限定、送料無料を創作しない。
- 添付画像の商品を別料理、別容量、別包装、別商品へ変えない。
- 過剰な煽り、検索語の羅列、不自然な絵文字の連続を使わない。

## 出力

- 指定JSON Schemaに一致するJSONだけを返す。
- `image_mode` は `TASK_JSON.imageMode` と完全一致させる。
- `generated_images` は4媒体すべて返し、生成モードでは実在する画像生成結果の絶対パスを返す。
- `prompt_summary` は実際に生成した構図を短く記録し、広告文へ混ぜない。
- `rationale` は媒体別の書き分け理由を簡潔にし、投稿文へ混ぜない。
