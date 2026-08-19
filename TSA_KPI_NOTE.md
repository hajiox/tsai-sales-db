# TSA KPI Operation Note

## 2026-08-08 FY2027年度目標

- FY2025実績は231,441,578円、FY2026実績は274,787,016円で、前年比は約18.7%増だった。
- FY2027（2026年8月〜2027年7月）は、成長負荷を抑えた前年比12.8%増の310,000,000円を全社目標として登録した。
- 部門目標はWEB 176,000,000円、外販・OEM 69,000,000円、会津ブランド館20,000,000円、食のブランド館45,000,000円。外販・OEMの内訳目標は外販48,000,000円、OEM 21,000,000円。
- 実行KPIは製造640,000点、新規・OEM獲得240件。営業目標は年間240件を月20件で平準化した。
- 月次売上と製造目標はFY2026の季節変動を基準にし、売上は10万円単位、製造は1,000点単位へ丸めた。
- 過去年度の比較では、`historical_actual` がある月を前々年度にも優先するよう修正した。
- ローカル・Vercelの両ビルドに成功。DB登録合計を確認し、本番のFY2027 KPI画面をPC・スマホで確認した。ブラウザコンソールエラーと横方向の画面はみ出しはなし。
- 営業のFY2026実績は7月分が未登録で、比較基準は11か月分192件。今期目標240件は運用可能な件数として設定した。
- Production: `https://v0-tsa-19.vercel.app/kpi?year=2027`

## 2026-08-08 FY2027年度目標の再配分

- 道の駅 食のブランド館を47,500,000円（前年度比約5.1%増）、会津ブランド館店舗を19,700,000円（同約5.2%増）へ変更した。
- WEBは174,000,000円、外販・OEMは65,000,000円へ引き下げた。外販・OEMの内訳は外販45,000,000円、OEM 20,000,000円。
- 全社目標は306,200,000円で3億円超を維持し、前年度比は約11.4%増。
- 売上再配分に合わせ、製造目標を630,000点、新規・OEM獲得目標を228件へ調整した。

## 2026-08-08 店舗2部門を3%成長へ再調整

- 道の駅 食のブランド館を46,600,000円（前年度比約3.1%増）、会津ブランド館店舗を19,300,000円（同約3.1%増）へ変更した。
- WEB 174,000,000円、外販・OEM 65,000,000円、新規・OEM獲得228件は据え置き。
- 全社目標は304,900,000円（前年度比約11.0%増）、製造目標は625,000点へ調整した。
- DB集計、Vercel本番ビルド、`/kpi?year=2027` の年度サマリーと月次表を確認済み。Production alias: `https://v0-tsa-19.vercel.app`

## 2026-08-09 Workforce cost impact review

- Verified TSA personnel cost from `monthly_account_balance`: JPY 4,306,101 for 2026-04 and JPY 4,376,725 for 2026-05.
- Verified the 2026-06 payroll source PDFs: 23 staff, gross payroll JPY 3,838,406, employer insurance JPY 438,912, and approximately 1,932 hourly-paid hours.
- Scenario for one additional full-time employee, one part-time employee, and a JPY 50 hourly-rate increase: approximately JPY 480,000-540,000 additional monthly employer cost. Exact pay and scheduled hours remain to be entered.
- Analysis only; no application or database behavior was changed, so no deployment was required.

## 2026-08-09 Core profitability diagnosis

- Verified FY2026 through 2026-05: sales JPY 220,527,990, gross profit JPY 101,960,254 (46.2%), SG&A JPY 106,279,950 (48.2%), and operating loss JPY 4,319,696 (-2.0%).
- Major burdens were personnel JPY 41,749,112 (18.9%), payment fees JPY 26,645,448 (12.1%), advertising JPY 11,005,403 (5.0%), and Yamato shipping posted to account 461 JPY 21,271,978 (9.6% of total sales; 17.2% of EC sales).
- October-November generated JPY 8,355,216 of operating profit, while the other eight months lost JPY 12,674,912. The business therefore depends on two peak months.
- Reaching a 5% operating margin requires about JPY 15,346,096 improvement over ten months, or JPY 1.53 million per month before the planned workforce increase and about JPY 2.04 million after it.
- Analysis only; no code, database, or production changes were made.

## 2026-08-09 Cross-channel profitability review

- Reconciled FY2026 through 2026-05 across `monthly_account_balance`, `general_ledger`, store sales, food-store sales, wholesale sales, OEM sales, and product margin masters.
- Roadside-station food operation: sales JPY 38,172,001; purchases JPY 10,344,050; directly identified station fees/common charges JPY 5,916,352; utilities JPY 1,278,367; contribution before payroll and other shared costs JPY 20,633,232.
- Aizu Brand Hall retail store: sales JPY 15,792,303; purchases JPY 11,841,971; gross profit JPY 3,950,332. Named rent, electricity, payment, communication, and removal costs left only JPY 782,939 before payroll. The store sales import has JPY 11,272,081 recorded at 100% gross margin, so imported gross-profit fields are not reliable for management decisions.
- Normal wholesale detail: sales JPY 26,364,489 and master-based estimated gross profit JPY 12,561,547 (47.65%). OEM detail: sales JPY 11,524,401, but margin is populated for only JPY 6,775,247; JPY 4,749,154 remains without a usable margin.
- Wholesale plus OEM detail totals JPY 37,888,890 versus account 811 sales JPY 43,173,839, a JPY 5,284,949 reconciliation gap. Identified 45 likely duplicated historical OEM lines between `wholesale_sales` and `oem_sales` (OEM amount JPY 7,831,618); the dashboard currently adds both data sets.
- Analysis only; no code, database, or production behavior was changed, so no deployment was required.

## 2026-08-09 Sales-mix and 50-percent cost scenario

- Current accounting cost of sales is JPY 118,567,786 against sales of JPY 220,560,115, or 53.76%. A 50% target would improve ten-month gross profit by approximately JPY 8,287,729, or JPY 828,773 per month.
- Applying that improvement to the previously verified operating loss would produce only about JPY 3,968,033 operating profit (1.8% of sales) before the planned workforce increase. The 50% cost target alone is therefore insufficient for a 5% operating margin.
- Current sales mix is WEB 55.96%, external/wholesale/OEM 19.57%, roadside-station food 17.31%, and Aizu Brand Hall retail 7.16%. Management should shift only contribution-positive sales: grow normal wholesale and profitable OEM first, then reduce low-contribution WEB sales rather than cutting WEB sales in advance.
- Analysis only; no code, database, or production behavior was changed, so no deployment was required.

## 2026-08-09 WEB product pricing review

- Analyzed the completed 12-month period from 2025-08 through 2026-07. WEB sales were JPY 151,380,370 across 71,776 product units; the 15 products above JPY 2,000,000 each represented JPY 99,397,682, or 65.7% of WEB sales.
- Recalculated direct contribution using product cost, actual channel-weighted marketplace deductions, series advertising cost, and the general-ledger-derived average Yamato allocation of approximately JPY 366 per product unit.
- Recommended nine lower-risk price changes covering about JPY 76,883,940 of current-price annual sales. With unchanged volume, the combined price and ad-rate actions improve annual direct contribution by approximately JPY 6,830,000; even at a 10% unit decline, estimated sales fall only 1.7% and direct contribution remains approximately JPY 5,818,000 above the current-price scenario.
- Identified separate corrective actions for the free-shipping six-serving noodles, one-serving BUTA, beans three-pack, horse sashimi, irregular chashu, and cut-end retort chashu because competitive position or product economics makes a simple uniform price increase unsafe.
- Data limitation: product-master prices and current marketplace prices are not always synchronized (notably the beans three-pack), and JPY 366 is an average shipping allocation rather than product-specific package freight.
- Analysis only; no application, database, or production behavior was changed, so no deployment was required.

## 2026-08-10 Post-price-change advertising risk review

- The current August WEB total of JPY 932,800 is not a valid post-change comparison: it covers only 2026-08-01 through 2026-08-03, includes Amazon, Yahoo, and BASE, and omits Rakuten because of unmatched products. The recorded row prices also remain the pre-change snapshots.
- July P-MAX/Google spend was JPY 265,099 for 21,248 clicks; Meta spend was JPY 164,601 for 10,506 clicks. Stopping both removes roughly 1,024 paid clicks per day while saving about JPY 429,700 per month.
- Google conversion values are not configured as purchase revenue and multiple campaign conversion counts exceed plausible product orders. Meta results likewise do not reconcile to purchases. Neither source can currently support a reliable ROAS judgment.
- July WEB direct contribution was approximately JPY 78,956 before Google and Meta and negative JPY 350,744 after those ads, using product costs, channel deductions, JPY 366 shipping per unit, and marketplace ads. Recommended keeping Meta paused and, if revenue protection is needed, restarting only selected high-margin P-MAX campaigns at a limited test budget after purchase-value tracking is corrected.
- Analysis only; no ad campaign, application, database, or production behavior was changed, so no deployment was required.
