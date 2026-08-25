---
name: generate-aizu-ec-product-names
description: TSAが渡す保存済み商品情報だけを分析し、Amazon、楽天、Yahoo、メルカリShops、BASE、Qoo10、TikTok向けの商品名候補を生成するCodex Bridge専用Skill。外部サイトの閲覧や変更は行わない。
---

# EC別商品名候補の生成

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

## 目的

`TASK_JSON` に含まれる現状商品名、商品ポイント、Web商品説明、商品仕様とサイト別ルールを根拠に、各ECで商品を正確に見つけやすく、読みやすい商品名候補を1件ずつ作る。

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

## サイト別判断

- `TASK_JSON.siteRules` の `platformMaxLength` は絶対上限とする。
- 原則 `preferredMaxLength` 以内に収める。超える具体的な利益がある場合でも絶対上限は超えない。
- Amazon、Yahooは重要な商品特定語を前半へ置き、短く明確にする。
- 楽天、Qoo10は自然な日本語を保ったまま、根拠のある検索語を補完する。
- メルカリShopsは一覧で判別できる簡潔さを優先する。
- BASEはブランドの読みやすさ、TikTokは商品種別と特徴の即時理解を優先する。
- 各ECの候補は同一である必要はない。ただし商品そのものの意味を変えない。

## 出力

- 日本語で記述する。
- 指定されたJSON Schemaに一致するJSONだけを返す。
- `selected_keywords` は実際に候補名へ採用した重要語だけを入れる。
- `rationale` はそのECでの判断理由を簡潔に示す。
