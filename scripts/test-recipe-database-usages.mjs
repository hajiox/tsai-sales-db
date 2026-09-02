import assert from "node:assert/strict";
import { buildRecipeDatabaseUsages } from "../lib/recipe-database-usages.ts";

const recipes = [
  { id: "recipe-a", name: "レシピA", category: "OEM", is_intermediate: false },
  { id: "recipe-b", name: "レシピB", category: "試作", is_intermediate: false },
];

const result = buildRecipeDatabaseUsages({
  recipes,
  ingredients: [
    { id: "ingredient-direct", name: "直接食材" },
    { id: "ingredient-salt-koji", name: "ハナマルキ 塩こうじ　塩麹" },
    { id: "ingredient-duplicate-a", name: "重複食材" },
    { id: "ingredient-duplicate-b", name: "重複食材" },
  ],
  materials: [
    { id: "material-label", name: "原材料シール" },
  ],
  recipeItems: [
    {
      recipe_id: "recipe-a",
      item_name: "旧名称でもIDを優先",
      item_type: "ingredient",
      ingredient_id: "ingredient-direct",
      material_id: null,
      usage_amount: 2,
      cost: 3,
    },
    {
      recipe_id: "recipe-a",
      item_name: "ハナマルキ 塩こうじ　塩麹",
      item_type: "ingredient",
      ingredient_id: null,
      material_id: null,
      usage_amount: 13.5,
      cost: 19.5372,
    },
    {
      recipe_id: "recipe-b",
      item_name: "  ハナマルキ 塩こうじ　塩麹  ",
      item_type: "ingredient",
      ingredient_id: null,
      material_id: null,
      usage_amount: 10,
      cost: 15,
    },
    {
      recipe_id: "recipe-a",
      item_name: "重複食材",
      item_type: "ingredient",
      ingredient_id: null,
      material_id: null,
      usage_amount: 1,
      cost: 1,
    },
    {
      recipe_id: "recipe-a",
      item_name: "原材料シール",
      item_type: "material",
      ingredient_id: null,
      material_id: null,
      usage_amount: 1,
      cost: 2,
    },
    {
      recipe_id: "recipe-a",
      item_name: "ハナマルキ 塩こうじ　塩麹",
      item_type: "material",
      ingredient_id: null,
      material_id: null,
      usage_amount: 1,
      cost: 1,
    },
  ],
});

assert.equal(result.ingredients["ingredient-direct"].length, 1, "direct ingredient ID should be used");
assert.equal(result.ingredients["ingredient-salt-koji"].length, 2, "unique exact names should recover unlinked recipes");
assert.equal(result.ingredients["ingredient-salt-koji"][0].totalUsage, 13.5);
assert.equal(result.ingredients["ingredient-salt-koji"][0].totalCost, 19.537);
assert.equal(result.ingredients["ingredient-duplicate-a"], undefined, "ambiguous names must not be linked");
assert.equal(result.ingredients["ingredient-duplicate-b"], undefined, "ambiguous names must not be linked");
assert.equal(result.materials["material-label"].length, 1, "materials should use the same safe fallback");
assert.equal(
  result.ingredients["ingredient-salt-koji"].find((usage) => usage.recipeId === "recipe-a").itemCount,
  1,
  "a wrong item type must not create an ingredient usage",
);

console.log("recipe database usage fallback tests passed");
