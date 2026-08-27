# TSA 原材料表示AI生成 運用メモ

## 2026-08-27 Codex Bridge化

- 旧Gemini API経由の生成を廃止し、`ingredient_label_generate` ジョブを新規の一時セッションで実行するTSA Codex Bridgeへ移行した。
- モデルは `gpt-5.6-sol`、reasoning effortは `ultra` に固定した。入力は保存済みレシピ・食材DB・中間部品の小型スナップショットだけで、過去Chat、既存タスク、外部サイトを参照しない。
- 専用Skill `generate-aizu-ingredient-label` と法令リファレンスを追加した。基準版は `2026-08-27.1`。
- 生成中にレシピまたは食材DBが変わった場合は保存を拒否する。曖昧一致、5%を根拠にしたキャリーオーバー省略、原料・添加物・アレルゲン・原産地の推測は禁止した。
- 生成結果は確認用候補であり、常に人による最終確認を要求する。不足情報が表示内容を左右する場合は採用不可にする。

### 公式確認先

- 消費者庁 食品表示法等: https://www.caa.go.jp/policies/policy/food_labeling/food_labeling_act/index.html
- 消費者庁 加工食品の食物アレルギー表示ハンドブック（令和8年4月版）: https://www.caa.go.jp/policies/policy/food_labeling/food_sanitation/allergy/assets/food_labeling_cms204_260401_02.pdf
- 消費者庁 原料原産地表示Q&A: https://www.caa.go.jp/policies/policy/food_labeling/quality/country_of_origin/qa/

### 検証

- 専用Skill構文検証: 成功
- Bridge Skill契約テスト: 成功
- 原材料表示Bridge契約テスト: 成功
- Sol/Ultra・読み取り専用・一時セッションの実動スモーク: 成功
- Next.js本番ビルド: 成功
- 本番DBのジョブ制約、重複防止索引、ワーカー能力条件: 適用・再検証成功

### 残る制約

- 原料規格書、実配合、製造工程、包材面積までTSAへ保存されていない情報はAIで補完しない。担当者が規格書と最終表示を照合する。
