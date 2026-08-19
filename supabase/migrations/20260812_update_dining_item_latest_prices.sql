begin;

-- Dining cost review performed against DocScanner on 2026-08-12.
-- price_incl_tax remains the tax-included package cost used by dining recipes.

update public.dining_items set
  price_incl_tax = 2224.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-08-06／20260807_002.pdf／和弘 B-81 香高湯（シャンガオタン）／税抜2,060円・食品8%税込2,224.80円。'
where id = 'd1000000-0000-4000-8000-000000000001';

update public.dining_items set
  price_incl_tax = 1447.2,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-08-04／20260804_様高瀬物産株式会社.pdf／和弘 粉粉豚骨スープ／税抜1,340円・食品8%税込1,447.20円。'
where id = 'd1000000-0000-4000-8000-000000000002';

update public.dining_items set
  price_incl_tax = 13662,
  notes = '調査済み（2026-08-12）。出典: DocScanner／星醸造株式会社／納品日2026-08-01／20260801_求書.pdf／ブレンド醤油スープ18Lバロン／税抜12,650円・食品8%税込13,662円。既存の出来高100,800gは維持。'
where id = 'd1000000-0000-4000-8000-000000000004';

update public.dining_items set
  price_incl_tax = 64.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 五十嵐製麺／納品日2026-07-31／20260701_㈱テクニカルスタッフ様.pdf／生ラーメン140g太／税抜60円・食品8%税込64.80円。原価表の使用量130gは変更せず、1食単価を採用。'
where id = 'd1000000-0000-4000-8000-000000000006';

update public.dining_items set
  price_incl_tax = 928.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-07-31／20260810_登録番号T2010601003415.pdf／ベストシェフ 味付メンマ（レトルトパック）／税抜860円・食品8%税込928.80円。'
where id = 'd1000000-0000-4000-8000-000000000008';

update public.dining_items set
  price_incl_tax = 138.24,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社二丸屋山口商店／納品日2026-07-14／20260715_011.pdf／マリンプロフーズ なると巻150g／税抜128円・食品8%税込138.24円。'
where id = 'd1000000-0000-4000-8000-000000000009';

update public.dining_items set
  price_incl_tax = 3088.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-04-30／20260510_請求書.pdf／横田屋 焼海苔十字切400枚（中国産）／税抜2,860円・食品8%税込3,088.80円。'
where id = 'd1000000-0000-4000-8000-000000000010';

update public.dining_items set
  price_incl_tax = 259.2,
  notes = '調査済み（2026-08-12）。出典: DocScanner／フレッシュ さいとう／納品日2026-05-28／20260611_019.jpg／万能ねぎ1束／税抜240円・食品8%税込259.20円。既存の1束90g・可食80g換算を維持。'
where id = 'd1000000-0000-4000-8000-000000000011';

update public.dining_items set
  price_incl_tax = 2592,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社会津山塩／納品日2026-07-31／20260808_001.pdf／会津山塩たれ1kg／税抜2,400円・食品8%税込2,592円。'
where id = 'd1000000-0000-4000-8000-000000000012';

update public.dining_items set
  price_incl_tax = 15282,
  notes = '調査済み（2026-08-12）。出典: DocScanner／星醸造株式会社／納品日2026-08-01／20260801_求書.pdf／ホタテの塩スープ18Lバロン／税抜14,150円・食品8%税込15,282円。'
where id = 'd1000000-0000-4000-8000-000000000014';

update public.dining_items set
  price_incl_tax = 648,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社二丸屋山口商店／納品日2026-07-14／20260715_011.pdf／カットわかめ（上）200g／税抜600円・食品8%税込648円。原価表の戻し後出来高1,500gは維持。'
where id = 'd1000000-0000-4000-8000-000000000015';

update public.dining_items set
  price_incl_tax = 723.6,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-08-03／20260807_010.pdf／VP いりごま（白）1kg／税抜670円・食品8%税込723.60円。'
where id = 'd1000000-0000-4000-8000-000000000016';

update public.dining_items set
  price_incl_tax = 367.2,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-08-04／20260807_007.pdf／CMF 料理酒1.8L／税抜340円・食品8%税込367.20円。'
where id = 'd1000000-0000-4000-8000-000000000017';

update public.dining_items set
  price_incl_tax = 5184,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-08-04／20260807_007.pdf／CMF サラダ油16.5kg／税抜4,800円・食品8%税込5,184円。'
where id = 'd1000000-0000-4000-8000-000000000018';

update public.dining_items set
  price_incl_tax = 1641.6,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-05-29／20260502_請求書.pdf／CMF 調合胡麻油ポリ1,650g／税抜1,520円・食品8%税込1,641.60円。'
where id = 'd1000000-0000-4000-8000-000000000019';

update public.dining_items set
  price_incl_tax = 5356.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-07-31／20260810_登録番号T2010601003415.pdf／マルコメ M-赤 粒無印20kg／税抜4,960円・食品8%税込5,356.80円。'
where id = 'd1000000-0000-4000-8000-000000000020';

update public.dining_items set
  price_incl_tax = 486,
  notes = '調査済み（2026-08-12）。出典: DocScanner／フレッシュ さいとう／納品日2026-05-30／20260611_020.jpg／玉ねぎ1kg／税抜450円・食品8%税込486円。既存の可食率90%を維持。'
where id = 'd1000000-0000-4000-8000-000000000021';

update public.dining_items set
  price_incl_tax = 410.4,
  notes = '調査済み（2026-08-12）。出典: DocScanner／フレッシュ さいとう／納品日2026-05-25／20260611_017.jpg／人参1kg／税抜380円・食品8%税込410.40円。既存の可食率93%を維持。'
where id = 'd1000000-0000-4000-8000-000000000022';

update public.dining_items set
  name = 'もやし',
  price_incl_tax = 48.6,
  notes = '調査済み（2026-08-12）。出典: DocScanner／フレッシュ さいとう／納品日2026-05-30／20260611_020.jpg／もやし250g入り／税抜45円・食品8%税込48.60円。価格確認済みのため品名の「価格確認」を解除。'
where id = 'd1000000-0000-4000-8000-000000000023';

update public.dining_items set
  price_incl_tax = 831.6,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社二丸屋山口商店／納品日2026-07-31／20260801_蹴…熟則噸､KJ菫笂屋山ﾛ商登録番号丁9380001017708.pdf／二丸屋印 生にんにく1kg／税抜770円・食品8%税込831.60円。既存の可食率90%を維持。'
where id = 'd1000000-0000-4000-8000-000000000025';

update public.dining_items set
  price_incl_tax = 572.4,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-04-30／20260510_請求書.pdf／K七味がらし300g／税抜530円・食品8%税込572.40円。'
where id = 'd1000000-0000-4000-8000-000000000026';

update public.dining_items set
  price_incl_tax = 2089.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-07-31／20260703_請求書.pdf／味の素 ハイミー1kg／税抜1,935円・食品8%税込2,089.80円。既存原価と同じ仕入先を継続採用。'
where id = 'd1000000-0000-4000-8000-000000000027';

update public.dining_items set
  price_incl_tax = 105.84,
  notes = '調査済み（2026-08-12）。出典: DocScanner／フレッシュ さいとう／納品日2026-05-28／20260611_019.jpg／ニラ1束／税抜98円・食品8%税込105.84円。既存DBの1束100g・可食90g換算を維持。'
where id = 'd1000000-0000-4000-8000-000000000028';

update public.dining_items set
  price_incl_tax = 313.2,
  notes = '調査済み（2026-08-12）。出典: DocScanner／株式会社 ダイサン食材／納品日2026-07-31／20260810164535.pdf／グラニュー糖1kg／税抜290円・食品8%税込313.20円。'
where id = 'd1000000-0000-4000-8000-000000000029';

update public.dining_items set
  price_incl_tax = 17610,
  notes = '調査済み（2026-08-12）。出典: DocScanner／道の駅あいづ湯川・会津坂下／納品日2026-06-25／20260625_請求書.pdf／会津産コシヒカリ30kg玄米 税抜16,000円（8%）＋精米代300円（10%）＝税込17,610円。既存の精米後27kg・炊飯後59.4kg換算を維持。'
where id = 'd1000000-0000-4000-8000-000000000033';

update public.dining_items set
  price_incl_tax = 1954.8,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-07-31／20260810_登録番号T2010601003415.pdf／マルコメ Rサーバー用 田舎味噌3kg／税抜1,810円・食品8%税込1,954.80円。既存の可食率95%を維持。'
where id = 'd1000000-0000-4000-8000-000000000034';

update public.dining_items set
  price_incl_tax = 1339.2,
  notes = '調査済み（2026-08-12）。出典: DocScanner／高瀬物産株式会社 会津支店／納品日2026-04-30／20260510_登録番号T2010601003415.pdf／マルコメ サーバー用 わかめ長ねぎ／税抜1,240円・食品8%税込1,339.20円。'
where id = 'd1000000-0000-4000-8000-000000000035';

update public.dining_items set
  price_incl_tax = 275.4,
  notes = '調査済み（2026-08-12）。出典: DocScanner／業務スーパー／納品日2026-04-25／20260425_業務スーパ.pdf／神戸 青かっぱ1kg／税抜255円・食品8%税込275.40円。'
where id = 'd1000000-0000-4000-8000-000000000036';

-- These rows cannot be updated safely from a single delivery-note price.
update public.dining_items set
  notes = '要確認（2026-08-12）。DocScannerで及川煮干（上）とサラダ油の現行単価は確認済みだが、中間仕込みの正確な配合内訳を原価表から確定できないため旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000005';

update public.dining_items set
  notes = '要確認（2026-08-12）。自社製造品のため納品書の単一商品単価では確定できず、チャーシュー製造原価の確定値との連携が必要。旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000007';

update public.dining_items set
  notes = '要確認（2026-08-12）。DocScannerで長ネギ・根生姜・サラダ油の現行単価は確認済みだが、中間仕込みの正確な配合と歩留まりの確定が必要なため旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000013';

update public.dining_items set
  notes = '要確認（2026-08-12）。自社製造副産物のため納品書の単一商品単価では確定できず、チャーシュー製造原価の配賦結果との連携が必要。旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000024';

update public.dining_items set
  notes = '要確認（2026-08-12）。DocScannerの最新仕入はキンセイ 厚切り三元豚ロースとんかつ180g・ケース税抜6,681円で、DBの160g規格と一致しないため旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000030';

update public.dining_items set
  notes = '要確認（2026-08-12）。DocScannerでブルドック 徳用とんかつソース1.8L・税抜500円は確認済みだが、調理後2,600gに含む他材料の配合が未確定のため旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000031';

update public.dining_items set
  notes = '要確認（2026-08-12）。DocScannerの最新仕入はフレッシュ さいとう・2026-05-30・キャベツ1個税抜280円だが、DBは1kg・可食850g換算で1個重量が不明のため旧原価を維持。'
where id = 'd1000000-0000-4000-8000-000000000032';

commit;
