-- 中間加工品の歩留まり（出来高率）を管理するカラム追加
-- yield_rate = 1.0 で歩留まり100%（ロスなし）、0.667 で約2/3

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_rate DECIMAL DEFAULT 1.0;

COMMENT ON COLUMN recipes.yield_rate IS '歩留まり率（出来高率）。1.0=100%, 0.667=約2/3。中間加工品のコスト計算で使用';
