# 厨房スタッフ端末のHTTPS設定（2026-10-15）

`GET /api/docscanner-staff-setup` は管理サイドバーのない公開HTML、`GET /api/docscanner-staff-setup/certificate` は固定の公開CA証明書配布です。既存の `/api` proxy除外を使用し、TSAのログイン・DB・業務API・登録コード発行には触れません。外部JS・解析・upload・書込み・任意パス指定はありません。

配布元は **`assets/docscanner-staff/staff-root-ca.cer` の単一DER公開証明書のみ**。1byte–16KiB、X509 raw全体一致、CA、subject=issuer、自己署名、現在有効をサーバーで毎回確認します。PEM、連結データ、PFX、秘密鍵や欠落・無効なファイルは固定503で停止し、内部パスやエラー詳細は返しません。両経路はno-store/nosniff/frame拒否/CSPを付け、証明書名・指紋・期限はHTMLエスケープします。配置ファイルはpublic配下に置かず、固定2経路のoutput tracing設定で含めます。

2026-10-15に管理者本人が専用CAとサーバー証明書を作成し、署名・期限・IP SAN・サーバー鍵の一致・保護ACLを検証しました。実公開DERだけを配置しています。Root SHA-256は `3359B17B2F2A3DA236454F4D9EE59B34C78DFD457CD1735B1FD494503BF9BA4E`、CA期限は2031-10-15、サーバー証明書期限は2027-10-15です。Rootの秘密鍵・暗号化PFX・パスフレーズはTSAソースへ持ち込みません。最終build/tracing・本番配布後も、スマホでの信頼設定と実機確認は別途必要です。

導入は管理者立会い・会社管理端末に限定します。CA信頼は接続先や8444ポート限定ではありません。iOS/iPadOSはSafariから `.cer` を開く[Apple QA1948](https://developer.apple.com/library/archive/qa/qa1948/_index.html)の方式と[完全信頼設定](https://support.apple.com/en-us/102390)を使い、[プロファイルは取得後8分以内にインストール](https://support.apple.com/en-us/102400)します。AndroidはOSの「CA証明書」導入を使い、証明書警告が残る場合は停止して管理者へ確認します。Androidの項目区別は[AOSP Settings](https://android.googlesource.com/platform/packages/apps/Settings/+/07026fd881/res/xml/install_certificate_from_storage.xml)を確認しました。証明書MIMEは標準の `application/pkix-cert` で固定し、実CA導入後に実機動作を確認します。

社内Wi-Fi接続後に固定の `https://192.168.110.200:8444/staff/register` を開きます。登録コードは管理者から端末ごとに個別発行（10分・1回限り）、登録後の端末資格は30日です。この配布ページはコードや資格を埋め込みません。

検証は純粋validator/HTML rendererと2つのGETを対象に、実暗号による正常CA・非CA・非自己署名・期限外・秘密/余分データ拒否、固定503、HTML escape、固定URL/headers/取得経路を確認します。実CA配置・本番配布は別の完了確認が必要です。
