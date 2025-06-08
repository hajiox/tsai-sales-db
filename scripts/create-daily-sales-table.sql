-- Create the daily_sales_report table
CREATE TABLE IF NOT EXISTS daily_sales_report (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  floor_sales INTEGER DEFAULT 0,
  floor_total INTEGER DEFAULT 0,
  cash_income INTEGER DEFAULT 0,
  register_count INTEGER DEFAULT 0,
  remarks TEXT,
  amazon_count INTEGER DEFAULT 0,
  amazon_amount INTEGER DEFAULT 0,
  rakuten_count INTEGER DEFAULT 0,
  rakuten_amount INTEGER DEFAULT 0,
  yahoo_count INTEGER DEFAULT 0,
  yahoo_amount INTEGER DEFAULT 0,
  mercari_count INTEGER DEFAULT 0,
  mercari_amount INTEGER DEFAULT 0,
  base_count INTEGER DEFAULT 0,
  base_amount INTEGER DEFAULT 0,
  qoo10_count INTEGER DEFAULT 0,
  qoo10_amount INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on the date column for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_sales_report_date ON daily_sales_report(date);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE daily_sales_report ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on daily_sales_report" ON daily_sales_report
  FOR ALL USING (true);
