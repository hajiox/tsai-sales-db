// lib/series-list.ts
// シリーズ一覧をDBから取得（フォールバック付き）

export interface SeriesItem {
    id?: string;
    code: number;
    name: string;
}

// DB からシリーズ一覧を取得
export async function fetchSeriesList(): Promise<SeriesItem[]> {
    try {
        const res = await fetch('/api/series', { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch failed');
        const { data } = await res.json();
        return data || SERIES_LIST_FALLBACK;
    } catch {
        return SERIES_LIST_FALLBACK;
    }
}

// フォールバック用ハードコード（DB未作成時やSSR時）
export const SERIES_LIST_FALLBACK: SeriesItem[] = [
    { code: 1, name: '本格チャーシュー' },
    { code: 2, name: 'レトルトチャーシュー' },
    { code: 3, name: 'パーフェクトラーメン喜多方' },
    { code: 4, name: 'パーフェクトラーメンSIO' },
    { code: 5, name: 'パーフェクトラーメンBUTA' },
    { code: 6, name: 'パーフェクトラーメンIE-K' },
    { code: 7, name: '特濃つけ麺' },
    { code: 8, name: '冷やし中華' },
    { code: 9, name: '麺のみ' },
    { code: 10, name: '辛杉家の憂鬱' },
    { code: 11, name: '会津ソースカツ丼' },
    { code: 12, name: 'ドレッシング' },
    { code: 13, name: '福島の桃' },
    { code: 14, name: '馬肉物語' },
    { code: 15, name: 'ご飯のお供' },
    { code: 16, name: 'AIZU CAMPFOOD' },
    { code: 17, name: '会津の馬刺し' },
    { code: 18, name: 'その他会津の食' },
    { code: 19, name: '国産チャーシュー' },
    { code: 20, name: 'パーフェクトラーメン辛味噌' },
    { code: 21, name: 'ラーメン背脂' },
    { code: 22, name: '【単品】' },
    { code: 23, name: 'パーフェクトラーメン背脂喜多方' },
    { code: 24, name: '悪魔カレー' },
    { code: 25, name: '単品' },
    { code: 99, name: '終売商品' },
];

// 後方互換: 同期的に使う場合のエクスポート（フォールバック値）
export const SERIES_LIST = SERIES_LIST_FALLBACK;
