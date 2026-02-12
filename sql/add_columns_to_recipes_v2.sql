-- Add new columns to recipes table
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS manufacturing_notes TEXT,
ADD COLUMN IF NOT EXISTS filling_quantity NUMERIC,
ADD COLUMN IF NOT EXISTS storage_method TEXT;

-- No need to add development_date as it already exists
-- If it doesn't exist for some reason, uncomment ensuring it's DATE
-- ALTER TABLE recipes ADD COLUMN IF NOT EXISTS development_date DATE;
