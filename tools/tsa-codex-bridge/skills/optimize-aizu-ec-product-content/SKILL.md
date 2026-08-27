---
name: optimize-aizu-ec-product-content
description: TSAが渡す保存済み商品ポイントとWeb商品説明を、事実と訴求を保ちながら合計500文字以内へ要約・整理するCodex Bridge専用Skill。外部サイトの閲覧や変更は行わない。
---

# EC商品文章の500文字調整

## Bridge Input Contract

- Run only through a fresh, non-resumed `codex exec`.
- Never open, read, search, or reuse app Chats, past tasks, threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete operational context.
- Freshかつ非再開の `codex exec` でのみ実行する。巨大な過去Chatを含むアプリ内Chat、過去タスク、スレッド、会話履歴、transcript、rollout、保存済みsessionを開かない・検索しない・再利用しない。
- Bridgeが渡す小さな `TASK_JSON` を完全な入力として扱う。このSkillが明示した情報以外を探さない。

## 目的

`TASK_JSON.sourceSnapshot.productPoints` と `webDescription` を、2項目の合計500文字以内へ調整する。商品ポイントは要点を先に、Web商品説明は読みやすい本文とし、両方の重複を削る。

## 判断基準

- 商品の事実は `sourceSnapshot` だけを使う。商品名、表示原材料、内容量、保存方法、賞味期限は、元文章の意味を確認する補助根拠である。
- 固有の魅力、購入判断に必要な仕様、使用・調理方法、注意点を優先する。
- 同じ内容の言い換え、過剰な形容、冗長な導入、検索語の羅列から先に削る。
- 商品ポイントは原則として1項目1行にし、先頭マーカーは `■` に統一する。
- Web商品説明は商品ポイントをそのまま繰り返さず、自然な日本語で補足する。
- 合計文字数は改行を除外せず、出力文字列のJavaScript文字数相当で500以内にする。

## 禁止事項

- Web検索、ブラウザ操作、外部EC閲覧、ファイル探索、リポジトリ確認、過去Chat参照をしない。
- 受賞、効能、健康効果、人気、ランキング、販売実績、産地、原材料、製法、内容量、送料無料、割引、限定などを創作しない。
- ECサイト、レシピ、LP、DBを変更しない。文章案の生成だけを行う。
- 元文章にある重要な安全情報や保存・調理条件を、文字数だけを理由に意味が変わる形で削らない。

## 出力

指定JSON Schemaだけを返す。`product_points` と `web_description` の合計を500文字以内にし、`total_characters` は両文字列の実際の合計と一致させる。`preserved_facts` と `removed_or_condensed` は判断の監査用に簡潔に記録する。
