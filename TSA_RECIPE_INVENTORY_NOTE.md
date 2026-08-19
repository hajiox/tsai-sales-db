# TSA 製造棚卸し

- 2026-07-27: Fixed DocScanner estimate intake creating new pouch and packaging items in the ingredient master by silent keyword fallback. The pending-estimate screen now requires an explicit `食材登録` or `資材登録` action, recommends materials for names such as `パウチ`, and the API rejects create/update requests when the target master is missing.
- Corrected `SSP16-F100（すうもも・桃白醤パウチ）` from `ingredients` to `materials` in production while preserving unit quantity `1`, tax-included price `53.9`, and tax-included status. It had no recipe or manufacturing-inventory references before the move.

更新日: 2026-07-22

- 画面: `/recipe/inventory`
- 決算年度は8月開始・翌年7月締め（例: 2026年度は2025年8月〜2026年7月）。
- 決算年度ごとに棚卸し表を1表保存する。保存済み年度を選択した場合は新規作成せず、その年度の入力値・追加行・削除状態を保持したまま再表示する。
- 新しい年度を選択した場合は、その時点の材料DBから食材・資材の棚卸し表を作成する。
- 食材は `ingredients`、資材は `materials` から棚卸し表を作成する。
- 登録価格が税込ならそのまま、税別なら食材8%・資材10%を加算し、「税込単価（原価）」として保存する。
- 棚卸し表作成時点の入数と税込原価を基準値として保存する。入数を変更した場合は `基準税込原価 × 変更後入数 ÷ 基準入数` で原価を自動調整する。
- 税込原価を手入力した場合は、その時点の入数と原価を新しい計算基準にする。
- 棚卸原価は `税込単価（原価）× 個数`。個数は小数入力にも対応する。
- 過去の棚卸し表は決算年度別の履歴として保持し、新規作成時に上書きしない。
- 材料DBにない品目は食材・資材ごとに手動追加でき、すべての行を棚卸し表から削除できる。
- スマホ操作、検索、未入力/入力済み絞り込み、CSV出力、常時表示QRに対応する。
- DB: `manufacturing_inventory_counts`, `manufacturing_inventory_items`

## 材料DB同期

- 最新の棚卸し表を開いた時、材料DBの品名・入数・税込原価の変更を自動反映する。
- 画面の更新ボタンからも任意に再同期できる。
- 同期時も棚卸し表へ入力済みの個数と備考は保持する。
- 過去の棚卸し履歴は作成時点の状態を残し、材料DBの変更で書き換えない。
- 棚卸し画面内で手動調整した入数・原価は、材料DB側が変更されていない限り保持する。
- 材料DB由来の比較値は `source_unit_quantity` と `source_tax_included_cost` に保持する。

## 2026-08-16 入力中の行移動を修正

- 数値変更を開始した行は、保存完了まで変更前の「未入力／入力済み」一覧に固定する。
- 連続入力中に古い保存応答が返っても、新しい編集状態と一覧位置を解除しないよう保存世代を管理する。
- `npm run build` 成功。入力値の保存仕様と、保存後に絞り込み結果へ反映する仕様は変更していない。
- 本番反映後、修正内容と確認結果をTSGの藤田香織さん個人DMへ報告済み。
