---
name: generate-aizu-ec-catchcopies
description: TSAが渡す保存済み商品情報だけを分析し、楽天とYahooへ一字一句同じ共通キャッチコピー候補を生成するCodex Bridge専用Skill。外部サイトの閲覧や変更は行わない。
---

# ECキャッチコピー候補の生成

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

`TASK_JSON.sourceSnapshot` の現状商品名、商品ポイント、Web商品説明、商品仕様、現在の共通キャッチコピーを分析し、楽天とYahooへ一字一句同じ文字列で登録する日本語キャッチコピーを1件だけ作る。

## 根拠

- 商品の事実は `TASK_JSON.sourceSnapshot` だけを使う。
- サイト別現状商品名、商品ポイント、Web商品説明、表示原材料、内容量、保存方法、賞味期限を横断して分析する。
- 情報不足や矛盾は `source_gaps` または `cautions` に記載し、候補へ推測で補わない。

## 禁止事項

- Web検索、ブラウザ操作、外部EC閲覧、ファイル探索、リポジトリ確認、過去チャット参照をしない。
- 受賞歴、効能、健康効果、人気、ランキング、販売実績、産地、原材料、製法、内容量、送料無料、割引、限定、最安を創作しない。
- 関係のない検索語、同義語の羅列、過剰な記号、煽り表現を入れない。
- レシピ、EC、LP、データベースを変更しない。候補生成だけを行う。

## 共通コピーの判断

- 楽天の自然な訴求とYahoo `headline` の検索性を同時に満たす。
- 最も厳しいYahooに合わせ、共通コピーは全角30文字以内を絶対条件とする。HTMLは使わない。
- 楽天とYahooへ渡す値は一字一句同じでなければならない。サイト別候補は作らない。

## 出力

指定JSON Schemaに一致するJSONだけを返す。`suggestion` は1件だけとし、`selected_keywords` は共通候補へ実際に採用した語だけ、`rationale` は両サイトの条件をどう両立したか簡潔に記載する。
