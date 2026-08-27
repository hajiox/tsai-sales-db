---
name: generate-aizu-ec-product-names
description: TSAが渡す保存済み商品情報だけを分析し、Amazon、楽天、Yahoo、メルカリShops、BASE、Qoo10、TikTokで一字一句同じ共通商品名候補を生成するCodex Bridge専用Skill。外部サイトの閲覧や変更は行わない。
---

# 全EC共通商品名候補の生成

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

`TASK_JSON` に含まれる現状の共通商品名、商品ポイント、Web商品説明、商品仕様と全サイトのルールを根拠に、7つのECすべてへ一字一句同じ文字列で登録する商品名候補を1件だけ作る。

## 根拠

- 商品の事実は `TASK_JSON.sourceSnapshot` だけを使う。
- 現状商品名、商品ポイント、Web商品説明、キャッチコピー、表示原材料、内容量、保存方法、賞味期限を横断して分析する。
- 同じ事実が複数欄にある場合は重複語を整理する。
- 情報不足や矛盾は `source_gaps` または各候補の `cautions` に記載し、商品名へ推測で補わない。

## 禁止事項

- Web検索、ブラウザ操作、外部EC閲覧、ファイル探索、リポジトリ確認、過去チャット参照をしない。
- 受賞歴、効能、健康効果、人気、ランキング、販売実績、産地、原材料、製法、内容量、送料無料、割引、限定、最安を創作しない。
- 関係のない検索語、同義語の羅列、過剰な記号、煽り表現を入れない。
- レシピ、EC、LP、データベースを変更しない。候補生成だけを行う。

## 共通名の判断

- `TASK_JSON.siteRules` の7サイト分を横断して判断し、特定サイトだけへ偏らせない。
- AmazonとYahooを含む最も厳しい共通上限の75文字以内を絶対条件とする。
- 主要な商品特定語を前半へ置き、自然な日本語、一覧での判別性、根拠のある検索語を両立する。
- Amazon、楽天、Yahoo、メルカリShops、BASE、Qoo10、TikTokへ渡す値は一字一句同じでなければならない。サイト別候補は作らない。

## 出力

- 日本語で記述する。
- 指定されたJSON Schemaに一致するJSONだけを返す。
- `suggestion` は1件だけ返す。
- `selected_keywords` は実際に共通候補へ採用した重要語だけを入れる。
- `rationale` は7サイトの条件をどう両立したか簡潔に示す。
