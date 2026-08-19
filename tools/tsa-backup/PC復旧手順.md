# TSA業務PC バックアップ・復旧手順

最終更新: 2026-08-11

## バックアップ構成

| 種別 | 実行時刻 | 保存先 | 保持 |
|---|---:|---|---:|
| 業務データ | 毎日 01:30 | 社内NAS + Google Drive | 30世代 |
| PCシステムイメージ | 毎週日曜 03:00 | 社内NAS | 2スロット |
| 自動検証・履歴再送 | 毎日 06:30 | TSAバックアップ管理へ記録 | 最新日次を検証 |

日次バックアップはAES-256で暗号化し、HMAC-SHA256で破損・改変を検証します。SQLiteは稼働中のファイルを直接コピーせず、オンラインバックアップ後に`quick_check`を行います。TSAのSupabase DBは`pg_dump`も保存します。

定期実行は既存の管理者権限付き`DocScanner PM2 Startup`タスクが、PM2の`tsa-backup-scheduler`をログイン前から復元します。日次・週次・監査の結果はTSAサイドバーの「バックアップ管理」に残ります。

## 保存先

- NAS: `\\tshdd\disk\NEW\TSA-PC-Backup`
- Google Drive: `G:\マイドライブ\TSA-PC-Backup`
- 復旧USB: `TSA-PC-RECOVERY`
- ローカル管理: `C:\ProgramData\TSA-Backup`
- TSA履歴: TSAサイドバーの「バックアップ管理」

USBには暗号復旧鍵があります。バックアップ本体とUSBを同じ場所に常置しないでください。

## 最初に判断すること

1. Windowsが起動するか。
2. Cドライブに物理障害の兆候があるか。異音、SMART警告、頻繁な読込エラーがある場合は書込みを止めます。
3. NASの`LATEST_BACKUP_STATUS.txt`相当の最新履歴をTSAで確認します。
4. 障害発生後に作られたバックアップは使わず、直前の正常な世代を選びます。

## A. Windowsが起動しない場合

1. 交換SSDまたは代替PCを用意します。
2. Windows回復環境を起動します。
3. 「トラブルシューティング」→「詳細オプション」→「イメージでシステムを回復」を選びます。
4. 社内LANを接続し、NASの`\\tshdd\disk\NEW\TSA-PC-Backup\system-image`にある最新の正常スロットを指定します。
5. 復元後、まだFAX、メール監視、EC速報、定期送信を開始しません。
6. 下記「復旧後の確認」を終えてから外部送信系を再開します。

## B. Windowsは起動するがデータだけ壊れた場合

管理者PowerShellでUSBの`TSA-PC-RECOVERY`を開き、次を実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd D:\TSA-PC-RECOVERY
.\Restore-TsaPc.ps1 -ListOnly
.\Restore-TsaPc.ps1
```

既定ではNASの最新日次バックアップを検証し、`C:\TSA-Restore-Staging\<実行ID>`へ展開するだけです。稼働中データは上書きしません。

特定世代を選ぶ場合:

```powershell
.\Restore-TsaPc.ps1 -RunId daily_data-20260811T013000
```

NASが使えない場合は、Google Driveの`daily`を指定します。

```powershell
.\Restore-TsaPc.ps1 -SourceRoot 'G:\マイドライブ\TSA-PC-Backup\daily'
```

展開後に、保守担当者が現行フォルダを別名退避し、DB・添付・ソースを切り替えます。現行フォルダを先に削除しないでください。

## 復旧後の確認

1. DocScannerの`documents.db`とヤマト管理の`analytics.db`で`quick_check=ok`。
2. TSA、TSG、DocScanner、ヤマト出荷データ管理へログインできる。
3. DocScannerの書類一覧、FAX受信、FAX送信履歴、メール履歴が開く。
4. EC速報の件数と直近注文が一致する。
5. WindowsタスクスケジューラとPM2で二重起動がない。
6. テスト用宛先だけでFAX・メール・掲示板連携を確認する。
7. 問題がなければ外部送信、メール監視、定期処理を一つずつ再開する。
8. TSA「バックアップ管理」に復旧日時、使用世代、確認結果を記録する。

## 日常確認

- TSA「バックアップ管理」で毎朝、直近の日次が成功または一部注意になっていることを確認します。
- 一部注意の場合、NASが成功してGoogle Driveだけ失敗していることがあります。内容を開いて確認します。
- 失敗が2日続いた場合は放置せず、NAS空き容量、Google Drive起動状態、USB接続、タスク履歴を確認します。
- 復旧USBは月1回、読めることだけ確認します。鍵ファイルをメールやチャットへ添付しないでください。

## 手動試験

管理者PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\TSA-Backup\Invoke-TsaDataBackup.ps1 -BackupType manual_test -TestMode
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\TSA-Backup\Invoke-TsaBackupAudit.ps1
```

ログは`C:\ProgramData\TSA-Backup\logs`、保留中のTSA履歴は`pending-history`にあります。
