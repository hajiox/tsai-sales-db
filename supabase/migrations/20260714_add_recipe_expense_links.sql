ALTER TABLE recipe_items
ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_items_expense_id
ON recipe_items(expense_id);
