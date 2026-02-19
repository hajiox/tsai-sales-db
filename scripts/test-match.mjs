const normalize = s => s.replace(/\s+/g, '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\d+[gGmlMLkKlL]+/g, '').replace(/徳用|お徳用|業務用|大容量/g, '').replace(/【P】/g, '');
const extractBrand = s => normalize(s).replace(/カレー|フレーク|ルウ|ルー|ソース|ペースト|だし|スープ|ドレッシング|マヨネーズ|ケチャップ|タレ|たれ/g, '');

// 濁点・半濁点を除去
const removeDakuten = s => {
    const map = { 'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ', 'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ', 'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ', 'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ', 'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ', 'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト', 'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ', 'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ' };
    return s.split('').map(c => map[c] || c).join('');
};

const tests = [
    ['バーモンドカレー', 'バーモントフレーク'],
];
tests.forEach(([a, b]) => {
    const bA = removeDakuten(extractBrand(a)), bB = removeDakuten(extractBrand(b));
    console.log(`${a} -> "${bA}" | ${b} -> "${bB}" | match:${bA === bB && bA.length >= 2}`);
});
