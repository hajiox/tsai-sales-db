// /app/api/ads/chat/route.ts
// 広告AI分析チャット — DB構造・広告ノウハウを含む専門アドバイザー
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ChatMessage {
    role: 'user' | 'model'
    text: string
}

// ===== 各プラットフォームのDB構造 =====
const dbSchemas: Record<string, string> = {
    amazon: `
## Amazon広告 DBスキーマ
- テーブル: amazon_ads_performance
  - report_month (text): 対象月 (YYYY-MM)
  - campaign_name (text): キャンペーン名
  - sku (text): SKU
  - asin (text): ASIN
  - impressions (integer): 表示回数
  - clicks (integer): クリック数
  - ctr (numeric): クリック率
  - cpc (numeric): クリック単価
  - cost (numeric): 広告費
  - sales (numeric): 広告経由売上
  - acos (numeric): ACoS（広告費÷売上）
  - roas (numeric): ROAS（売上÷広告費）
  - orders (integer): 注文数
  - units_sold (integer): 販売個数
  - series_code (integer): 商品シリーズ紐付けコード（productsテーブルと連携）
- テーブル: amazon_code_series_map（ASIN→シリーズ学習マッピング）
- テーブル: advertising_costs（amazon_costカラムでシリーズ別月次広告費を集計）`,

    google: `
## Google広告 DBスキーマ
- テーブル: google_ads_performance
  - report_date (date): レポート日
  - campaign_name (text): キャンペーン名
  - asset_group_name (text): アセットグループ名
  - asset_group_status (text): ステータス (ENABLED/PAUSED等)
  - series_code (integer): 商品シリーズ紐付け
  - cost_micros (bigint): 広告費（マイクロ単位、÷1000000で円）
  - impressions (integer): 表示回数
  - clicks (integer): クリック数
  - conversions (numeric): コンバージョン数
  - conversions_value (numeric): コンバージョン値
- テーブル: google_ads_series_mapping（アセットグループ→シリーズ学習マッピング）
- テーブル: advertising_costs（google_costカラムでシリーズ別月次広告費を集計）`,

    meta: `
## Meta広告 DBスキーマ
- テーブル: meta_ads_performance
  - report_month (text): 対象月 (YYYY-MM)
  - campaign_name (text): キャンペーン名
  - ad_set_name (text): 広告セット名
  - delivery (text): 配信ステータス
  - results (numeric): 結果（目的別CV数）
  - cost_per_result (numeric): 結果単価（CPA）
  - amount_spent (numeric): 広告費
  - impressions (integer): 表示回数
  - reach (integer): リーチ（ユニークユーザー到達数）
  - frequency (numeric): フリークエンシー（平均表示回数/人）
  - cpm (numeric): CPM（1000表示あたりコスト）
  - clicks (integer): 全クリック数
  - link_clicks (integer): リンククリック数
  - ctr (numeric): CTR
  - cpc (numeric): CPC
  - series_code (integer): 商品シリーズ紐付け
- テーブル: meta_adset_series_map（広告セット→シリーズ学習マッピング）
- テーブル: advertising_costs（meta_costカラムでシリーズ別月次広告費を集計）`,

    rakuten: `
## 楽天RPP広告 DBスキーマ
- テーブル: rakuten_ads_performance
  - report_month (text): 対象月 (YYYY-MM)
  - product_code (text): 商品管理番号
  - product_url (text): 商品URL
  - bid_price (numeric): 設定入札単価（上限CPC）
  - ctr (numeric): CTR
  - clicks (integer): クリック数
  - amount_spent (numeric): 広告費
  - cpc_actual (numeric): 実際のCPC
  - clicks_new (integer): 新規クリック数
  - amount_spent_new (numeric): 新規広告費
  - clicks_existing (integer): 既存クリック数
  - amount_spent_existing (numeric): 既存広告費
  - sales_amount (numeric): 売上（720時間計測）
  - sales_count (integer): 注文数
  - cvr (numeric): CVR
  - roas (numeric): ROAS（%表示、300%=3倍）
  - cost_per_order (numeric): 注文当たり広告費
  - series_code (integer): 商品シリーズ紐付け
- テーブル: rakuten_code_series_map（商品コード→シリーズ学習マッピング）
- テーブル: rakuten_product_names（商品コード→商品名マッピング）
- テーブル: advertising_costs（rakuten_costカラムでシリーズ別月次広告費を集計）`,

    yahoo: `
## Yahoo!アイテムリーチ広告 DBスキーマ
- テーブル: yahoo_ads_performance
  - report_month (text): 対象月 (YYYY-MM)
  - product_code (text): 商品コード
  - product_name (text): 商品名
  - category (text): カテゴリ
  - impressions (integer): 表示回数
  - clicks (integer): クリック数
  - ctr (numeric): CTR（%表示）
  - cpc (numeric): CPC
  - amount_spent (numeric): 広告費
  - orders (integer): 注文数
  - order_quantity (integer): 注文個数
  - sales_amount (numeric): 売上
  - cvr (numeric): CVR（%表示）
  - roas (numeric): ROAS（%表示、300%=3倍）
  - series_code (integer): 商品シリーズ紐付け
- テーブル: yahoo_code_series_map（商品コード→シリーズ学習マッピング）
- テーブル: advertising_costs（yahoo_costカラムでシリーズ別月次広告費を集計）`,
}

// ===== 各プラットフォームの広告運用ノウハウ =====
const platformKnowledge: Record<string, string> = {
    amazon: `
## Amazon スポンサープロダクト広告 運用ノウハウ

### キャンペーン構造の最適化
- 「目的別」のキャンペーン分割が基本: オート（探索用）、マニュアル（刈り取り用）、商品ターゲティング（競合対策・クロスセル）
- 1つの広告グループに複数マッチタイプを混在させない
- マッチタイプ（部分一致/フレーズ一致/完全一致）ごとにキャンペーンを分けるのが定石

### ACoS・ROAS改善
- 損益分岐点ACoSの算出が必須: 粗利率から「これ以上だと赤字」のラインを明確化
- 入札調整: 10クリック以上のデータに基づき、成果の良いキーワードは増額、悪いのは減額
- 「検索結果トップ」プレースメント調整（入札倍率設定）でCVR高い掲載枠への露出を最適化
- ACoSが高い場合のチェック: ①除外キーワード不足 ②入札が高すぎ ③商品ページの質が低い

### 検索語句レポートの活用（週次で必須）
- CVRの高い語句を完全一致のマニュアルキャンペーンへ「育成（Harvest）」
- CVにつながらない語句を「除外キーワード」として登録し無駄クリック削減
- オートキャンペーンで得た良い語句 → マニュアルキャンペーンに移して精密管理

### 商品ページ（LP）の重要性
- 広告はあくまで入口。売上を決めるのは商品ページ（画像・A+コンテンツ・レビュー・価格）
- 広告数値が悪い場合はページ側の改善を先行
- レビュー件数・評価が低い商品は広告を控え、まずレビュー施策に注力

### 2025-2026年トレンド
- Amazon Marketing Cloud (AMC): カート落ちユーザーへの再アプローチ
- 動画広告の活用: CTR・転換率向上に大きく寄与
- AI自動化ツールとの併用が主流化`,

    google: `
## Google広告 運用ノウハウ

### P-MAXキャンペーンの最適化
- アセットグループの構成: 1シリーズ=1アセットグループが基本
- 各アセットグループに高品質な画像・動画・テキストを十分に供給
- 最低でも15種類のテキストアセット、5種類の画像アセットを用意
- ファイナルURLの拡張: 最適なLPをGoogleが自動選択

### コンバージョン最適化
- コンバージョン計測の正確性が最重要（GTM設定の確認）
- 目標CPA or 目標ROASの設定：過去実績から逆算
- 学習期間（2-4週間）は大幅な変更を避ける
- コンバージョン値の最大化入札で高LTV顧客への最適化

### 品質スコア改善
- 広告文とLPの関連性を高める
- LPの表示速度改善（Core Web Vitals）
- 期待されるCTRの改善（広告文のA/Bテスト）

### 予算管理
- 予算制限がかかっている場合は機会損失
- CPA目標に対して十分な予算配分を確認
- 曜日・時間帯別の入札調整でROI向上`,

    meta: `
## Meta（Facebook/Instagram）広告 運用ノウハウ

### ターゲティング最適化：AIへの委任が主流
- Advantage+ セールスキャンペーン (ASC) の活用が2026年の推奨
- 「詳細ターゲティング」の過度な絞り込みはAIの学習機会を奪い、逆にCPAを高騰させる
- 基本は「ブロード（広範囲）」配信: AIがシグナルを多く拾い→CPA低下傾向
- 除外設定（既存顧客の除外など）のみを適切に行うのが現在の主流

### クリエイティブ戦略（運用の核心）
- 「AIへの材料供給」の視点: 動画・静止画・カルーセル等を複数用意
- 動画重視: リール広告枠はインプレッション多く・CPA安価→縦型動画は必須
- UGC風クリエイティブ: 広告色の強すぎるものより自然な動画が高パフォーマンス
- 冒頭3秒で異なる切り口（悩み解決型・ベネフィット型・権威性型）の素材を複数

### CPA改善チェックリスト（優先順位順）
1. コンバージョンAPI（CAPI）の導入: Cookie規制対応の必須事項
2. 学習期間（7日間）の保護: 頻繁な変更は学習リセット→CPA不安定化の原因
3. 広告とLPの一貫性: ファーストビュー3秒以内の離脱を防ぐ→CVR向上＝CPA低下
4. 自動配置の利用: Metaが最も安く成果が出る場所をリアルタイム判断

### フリークエンシー管理
- フリークエンシー3.0以上は広告疲れの兆候
- 対策: クリエイティブの差し替え、ターゲットの拡大、配信制限

### 指標の読み方
- リーチ vs インプレッション: リーチ=ユニークユーザー数、インプレッション=延べ表示回数
- CPM: 1000表示あたりコスト（ターゲット競合度の指標）
- 結果/結果単価: キャンペーン目的に応じたCV/CPA`,

    rakuten: `
## 楽天RPP広告 運用ノウハウ

### 自動最適化時代の新常識（2025年7月〜）
- 設定CPCは「上限値」: 楽天AIが掲載面・時間帯・ユーザー属性に応じて実際のCPCを動的決定
- CTR 0.5%がAI評価の基準: これを超えると上限CPCでの入札が行われやすい
- CTR 0.5%未満は露出・入札単価が抑制される傾向
- イベント終了後に広告消化額が急増する傾向→CPC調整／予算制限／一時停止でフォロー

### ROAS改善のステップ（優先順位順）
1. 除外商品設定（最重要）: ROASが極端に低い/低利益商品を除外
2. サムネイル改善（CTR改善）: クリック率が低い商品は画像改善を最優先
3. 「限界ROAS」に基づく判断: 利益率から算出した限界ROAS未満の商品のみCPC引き下げ
4. キーワードCPCの活用: CVRが高い検索クエリに投資集中

### 楽天特有の指標
- 売上(720h): 広告クリックから720時間（30日）以内に同一ユーザーが購入した売上
- 新規/既存ユーザーの分離: 新規獲得にどれだけ寄与しているかの判断材料
- ROAS%表示: 300% = 広告費の3倍の売上（一般的に300%以上が目安）

### 運用サイクル（週次）
- パフォーマンスレポートでCTR・CVR・ROASをチェック
- 売れ筋かつ高利益率商品に予算集中、それ以外は入札抑制
- ロングテールキーワード戦略: CPCが低くCVRが高いニッチキーワードから開始

### RPPエクスパンション広告
- 楽天外（Google検索等）からの流入獲得が可能
- 一定の売上実績が利用条件`,

    yahoo: `
## Yahoo!ショッピング アイテムリーチ広告 運用ノウハウ

### 「アイテムリーチ広告」への適応（2025年8月〜）
- 旧「アイテムマッチ」から刷新: 配信ロジックの高度化とターゲティングの柔軟性向上
- AIによる自動最適化: 検索キーワード＋ユーザー閲覧・購入履歴＋季節要因を判定して配信
- キーワード単位の入札が可能に: 売上の高いキーワードに入札集中

### CPC改善とROAS最大化のステップ
- 「利益が出るクリック」を増やすのが目的（単にCPC下げるのではない）
- 高CVR商品への集中投資: 広告レポートでCVR高い商品を特定→予算集中
- 低効率商品の広告停止/入札抑制で予算を振り向け

### 商品データ・SEO最適化（必須）
- 商品名・キャッチコピー・サムネイル画像の改善が広告の前提
- 検索結果でクリックされるための魅力的なタイトルが重要

### イベント・季節性を意識した運用
- 「5のつく日」や超PayPay祭で売上が大きく変動
- イベント期間前後は入札単価を一時的に引き上げ（ブースト戦略）
- シーズン性の予測: 需要高まり1-2ヶ月前から広告露出を段階的に増加

### PDCA指標の読み方
| 指標 | 改善のヒント |
|------|------------|
| 表示回数少ない | 入札単価が低い/競合が強力→単価引き上げ検討 |
| CTR低い | 商品名・画像・価格が魅力不足→サムネイル見直し |
| CVR低い | 商品ページ内容不足/ターゲット不一致 |
| ROAS低い | 入札単価を下げる/低効率商品の広告停止 |`,
}

// ===== 共通のDB構造知識 =====
const commonDbSchema = `
## 共通DBスキーマ（Supabase PostgreSQL）
- テーブル: products（商品マスター）
  - id (uuid): 商品ID
  - name (text): 商品名
  - series (text): シリーズ名（商品グループ）
  - series_code (integer): シリーズコード（全広告テーブルの紐付けに使用）
  - price (integer): 販売価格
  - is_hidden (boolean): 終売フラグ
- テーブル: advertising_costs（シリーズ別月次広告費集計）
  - report_month (date): 対象月（YYYY-MM-01形式）
  - series_code (integer): シリーズコード
  - google_cost, meta_cost, amazon_cost, rakuten_cost, yahoo_cost, other_cost (numeric): 各プラットフォーム広告費
- テーブル: web_sales_summary（月次売上集計）
  - product_id → products.id
  - report_month (date)
  - amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count (integer): EC別販売数
  - unit_price (integer): スナップショット単価
`

export async function POST(request: NextRequest) {
    try {
        const { messages, context, platform } = await request.json() as {
            messages: ChatMessage[]
            context: string  // 広告データのサマリー
            platform: string // amazon | google | meta | rakuten | yahoo
        }

        if (!messages || messages.length === 0) {
            return NextResponse.json({ success: false, error: 'メッセージは必須です' }, { status: 400 })
        }

        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY未設定' }, { status: 500 })
        }

        const platformNames: Record<string, string> = {
            amazon: 'Amazon スポンサープロダクト広告',
            google: 'Google広告（P-MAX）',
            meta: 'Meta（Facebook/Instagram）広告',
            rakuten: '楽天RPP広告',
            yahoo: 'Yahoo!ショッピング アイテムリーチ広告',
        }

        const systemPrompt = `あなたは${platformNames[platform] || 'WEB広告'}の専門アドバイザーです。
EC事業者の広告運用を支援するプロフェッショナルとして、データに基づいた具体的で実用的なアドバイスを提供してください。

${commonDbSchema}

${dbSchemas[platform] || ''}

${platformKnowledge[platform] || ''}

## 現在の広告データコンテキスト
${context}

## 回答ルール
- 日本語で回答してください
- 質問に対して的確かつ具体的に回答してください
- データに基づいた分析・提案をしてください（推測の場合はその旨を明記）
- 具体的な数値目標や改善施策を含めてください
- 業界平均や一般的なベンチマークとの比較を行ってください
- 優先順位をつけて改善アクションを提示してください
- 回答はMarkdown形式で構造化してください
- 長すぎる回答は避け、要点を絞ってください
- このプラットフォーム固有の仕組み・特性に基づいた回答をしてください`

        // Gemini API用の会話履歴を構築
        const contents = [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + messages[0].text }]
            }
        ]

        // 2つ目以降のメッセージを追加
        for (let i = 1; i < messages.length; i++) {
            contents.push({
                role: messages[i].role === 'user' ? 'user' : 'model',
                parts: [{ text: messages[i].text }]
            })
        }

        // Gemini 2.5 Flash を使用（コスト効率の良い高性能モデル）
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
            }
        )

        const geminiData = await geminiRes.json()
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
            || '回答を生成できませんでした。もう一度お試しください。'

        return NextResponse.json({ success: true, reply })
    } catch (error: any) {
        console.error('広告チャットエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
