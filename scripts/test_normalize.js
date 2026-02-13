
function normalize(s) {
    return s
        .replace(/【.*?】/g, '') // Remove [Product], [P], etc.
        .replace(/[（(].*?[)）]/g, match => match.slice(1, -1)) // Keep content, remove parens? Or just remove parens chars
        // Wait, if I replace (大) with 大, it works for "matches".
        // But s.replace(/[（()）]/g, '') does exactly that.
        .replace(/[（()）]/g, '')
        .replace(/\s+/g, '')
        .replace(/の/g, '') // Dangerous? "きのこ" -> "きこ". 
        // Maybe only remove "の" if followed by "たれ"? No.
        // Let's rely on simple chars removal first.
        .trim();
}

const recipeName = "【P】チャーシューたれ（大）";
const itemName = "【P】チャーシューのたれ大";

const n1 = normalize(recipeName);
const n2 = normalize(itemName);

console.log(`Recipe: ${recipeName} -> ${n1}`);
console.log(`Item:   ${itemName} -> ${n2}`);
console.log(`Match?  ${n1 === n2}`);

const r2 = "【P】完全再現スープ（背脂醤油）";
const i2 = "完全再現スープ背脂醤油";
console.log(`\nRecipe: ${r2} -> ${normalize(r2)}`);
console.log(`Item:   ${i2} -> ${normalize(i2)}`);
