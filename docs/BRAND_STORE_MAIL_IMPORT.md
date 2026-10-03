# 食のブランド館・経理メール取込

2026-10-03: DocScannerが受信する `ts@ai.aizu-tv.com` 宛の `keiri@michinoeki-aizu.com` からの「道の駅あいづ ABC分析表M月分」を、TSAの食のブランド館分析へ連携する。CSV（UTF-8/Shift_JIS）と今回のExcelを同じ厳密検証へ通す。AIや過去チャットは使用しない。

## 接続契約

`POST /api/brand-store/mail-import`、`Authorization: Bearer <TSA_BRAND_STORE_MAIL_TOKEN>`。専用secretをTSA ProductionとDocScannerにだけ設定し、ログへ出さない。

JSON必須値: `account`, `sender`, `sourceMessageId`, `subject`, `receivedAt`（ISO日時）、`reportMonth`（YYYY-MM）、`attachmentName`, `attachmentSha256`（小文字SHA-256）、`contentBase64`。添付は2MB以下、名前は `M.1-M.月末.csv` または `.xlsx`。受信日から1〜12か月前のみ。件名・ファイル名・Excel/新CSVの全行の日付が全月と一致する必要がある。

「ABC分析表７・８月分」のような複数月を明示した件名も、全角数字を正規化して受け付ける。同じメールに複数月の添付がある場合はファイル単位で独立したreceiptを返す。DocScannerは全対象添付が成功してから1通の返信を行う。TSAのsource一意キーはアカウント・メールID・添付名で、異なる月の添付を重複扱いしない。

実際のCSVとExcelは同じPOS列で、店舗ＧＰコード1・仕入先コード995に限定。部門51/52の両方を保持。画面の別形式の手動CSVは自動経路では受け付けない。必須列不足、空欄、不正な整数、数式、複数シート、打ち切られたExcel、期間混在、原価/粗利不一致、同じ商品名の別商品/部門は `422 needs_review`。勝手な数値補完はしない。

商品ID・商品名・別名・バーコードの一意な照合だけ使用する。未照合はNULLの商品IDで原名・部門・商品コード・バーコードを保存する。架空の商品マスター登録はしない。原本はDocScannerに保全し、TSAのprivate履歴には正規化した全行・全金額・原価・部門/店舗/仕入先を保持する。同じ商品名で同じJAN/部門の行だけ合算し、元86行/84商品でも数量・売上・粗利を保持する。

## 保存と返信の条件

新しい月のみ `import_brand_store_mail` RPCで全月の売上とprivate受信履歴を原子的に保存する。既存月や同月で異なる内容は `409 needs_review` で取り込まない。月の売上修正履歴は変更しない。既存の手動取込のDELETE/INSERTとの並走は保存中のテーブルロックで調停する。

同じメール/添付や同じ正規化内容の再送は `already_imported`。毎回、現在のDB全行・全列が成功時の保存内容と一致することを検証する。件数/合計が同じだけでは成功にしない。後の手動修正/削除があれば `needs_review`。成功返答には `importId`, `sourceMessageId`, `attachmentSha256`, `contentSha256`, `reportMonth`, `rowCount`, `sourceRowCount`, `totalSales`, `totalQuantity`, `totalGrossProfit`, `totalCostAmount`, `unmatchedProductCount` を含む。

DocScannerは成功receiptと対象メール/添付/期間の一致を確認した後だけ返信をoutboxへ記録する。成功していないメールへ受領返信しない。返信の重複/不明な送信結果はDocScanner側で管理する。

## 検証・配備

`node --experimental-strip-types scripts/test-brand-store-mail-import.mjs`。
`node --experimental-strip-types scripts/apply-brand-store-mail-import-migration.mjs` はmigration・合成データ・再送・変更・権限・全行照合をtransaction内で確認し、全てrollbackする。`--fixture <outside-git実添付>` で実物86行/84商品をrollback検証できる。`--apply` は検証済migrationだけを適用する。

対象lint/型検証、`npm run predeploy`（secret scan、DB RLS、build）、migration適用、Production deploy、実メールの端から端までの受領確認が完了条件。機密添付、DBバックアップ、secret、メール本文をGitへ保存しない。
