---
name: generate-aizu-sns-posts
description: TSAが渡す保存済み商品情報と許可済み商品LPの抜粋だけを分析し、X、Instagram、IGストーリー、Threads向けの投稿文を生成するCodex Bridge専用Skill。外部サイト閲覧や投稿は行わない。
---

# 会津ブランド館 SNS投稿文の生成

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

`TASK_JSON.sourceSnapshot` に固定されたEC商品名、キャッチコピー、商品ポイント、Web商品説明、商品仕様、許可済み商品LP抜粋を横断して分析し、媒体ごとにユニークで訴求力のある日本語投稿文を1件ずつ作る。

## 根拠

- 商品の事実は `TASK_JSON.sourceSnapshot` だけを使う。
- `TASK_JSON.writingTone` は `official`、`staff`、`developer` のいずれかであり、4媒体へ同じ人格を適用する。出力の `writing_tone` に一字一句同じ値を返す。
- `sourceSnapshot.variationKey` を今回の主な訴求軸として、その文字列を出力の `variation_key` に完全一致で返す。
- 商品LPの `warning` がある、または本文が空の場合はLPを推測で補わず `source_gaps` に記録する。
- 同じ事実を媒体ごとの読まれ方に合わせて書き分ける。4媒体へ同文を短縮して使い回さない。

## 投稿文の口調

- `official`: 会津ブランド館のオフィシャル発信。マーケッター視点で商品の価値と利用場面を落ち着いて端的に紹介し、身内話や一人称の開発談は使わない。
- `staff`: 店舗スタッフの明るく元気な口調。自然な挨拶や軽い世間話、控えめなユーモアを交え、`official`より長めにする。Xは220〜360文字、Instagramは700〜1,300文字、Threadsは300〜480文字を目安にするが媒体上限を優先する。入力にない店内の出来事、実食感想、客の反応は創作しない。
- `developer`: 商品開発者本人の発信。一人称を使う場合は必ず「私」とし、「です・ます」調で落ち着いて丁寧に伝える。入力にある商品ポイント、仕様、製法から、強み、設計意図、大切にしている点を具体的に掘り下げる。入力にない開発経緯、試作回数、苦労話、比較優位は創作しない。命令、説教、挑発、優越表現、強い断定、他社批判は使わず、理由を説明して選択を読み手へ委ねる。「絶対」「これが正解」「〜すべき」「〜してほしい」「譲れない」「分かる人には分かる」のような押し付ける表現も使わない。
- IGストーリーは50文字の視認性を優先し、どの口調でも人格を誇張しない。

## 絶対禁止

- Web検索、ブラウザ操作、外部SNS・EC閲覧、ファイル探索、リポジトリ確認、過去チャット参照をしない。
- SNS投稿、予約投稿、EC・LP・レシピ・画像・データベースの変更をしない。
- 受賞歴、効能、健康効果、人気、ランキング、販売実績、産地、原材料、製法、価格、割引、在庫、期間限定、送料無料を創作しない。
- 入力にない人物の体験談、購入者の声、数値、比較優位を作らない。
- 過剰な煽り、検索語の羅列、不自然な絵文字の連続を使わない。

## 媒体別ルール

- X: 投稿文とハッシュタグを合わせて400文字以内。冒頭で興味を引き、ハッシュタグは0〜3件。
- Instagram: 投稿文とハッシュタグを合わせて2,200文字以内。読みやすく改行し、根拠のあるハッシュタグを10〜15件。
- IGストーリー: 50文字以内、ハッシュタグなし。画像上で一目で読める一文。
- Threads: 投稿文とハッシュタグを合わせて500文字以内。会話のきっかけになる自然な語り口、ハッシュタグは0〜5件。
- `TASK_JSON.platformRules` の文字数・ハッシュタグ数は絶対上限として従う。
- ハッシュタグは `#` から始め、空白を含めない。

## 出力

指定JSON Schemaに一致するJSONだけを返す。`writing_tone` は `TASK_JSON.writingTone` と完全一致させる。`rationale` は媒体別の書き分け理由を簡潔にし、ユーザー向け投稿文へ混ぜない。
