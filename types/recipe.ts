// types/recipe.ts
// レシピシステムの型定義

export interface RecipeCategory {
    id: string;
    name: string;
    description?: string;
    created_at: string;
}

export interface IngredientCategory {
    id: string;
    name: string;
    created_at: string;
}

export interface Ingredient {
    id: string;
    category_id?: string;
    name: string;
    unit_quantity: number;
    price_incl_tax?: number;
    price_excl_tax?: number;
    price_per_gram?: number;
    calories?: number;
    protein?: number;
    fat?: number;
    carbohydrate?: number;
    sodium?: number;
    supplier?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface Recipe {
    id: string;
    category_id?: string;
    name: string;
    development_date?: string;
    manufacturing_notes?: string;
    filling_quantity?: number;
    storage_method?: string;
    selling_price_incl_tax?: number;
    selling_price_excl_tax?: number;
    production_quantity: number;
    total_cost?: number;
    unit_cost?: number;
    total_weight?: number;
    status: 'draft' | 'active' | 'archived';
    source_file?: string;
    source_sheet?: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    category?: RecipeCategory;
    ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
    id: string;
    recipe_id: string;
    ingredient_id?: string;
    ingredient_name: string;
    usage_amount?: number;
    calculated_cost?: number;
    percentage?: number;
    display_order?: number;
    calories?: number;
    protein?: number;
    fat?: number;
    carbohydrate?: number;
    sodium?: number;
    // Joined fields
    ingredient?: Ingredient;
}

export interface RecipeWithDetails extends Recipe {
    category: RecipeCategory | null;
    ingredients: RecipeIngredient[];
    // Calculated nutrition totals
    nutrition_totals?: {
        calories: number;
        protein: number;
        fat: number;
        carbohydrate: number;
        sodium: number;
    };
}

export interface RecipeListItem {
    id: string;
    name: string;
    category_name?: string;
    development_date?: string;
    selling_price_incl_tax?: number;
    unit_cost?: number;
    profit_margin?: number | null;
    ingredient_count: number;
}
