-- Create the sales_reports table
CREATE TABLE IF NOT EXISTS sales_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  floor_sales INTEGER DEFAULT 0,
  floor_total INTEGER DEFAULT 0,
  cash_income INTEGER DEFAULT 0,
  register_count INTEGER DEFAULT 0,
  remarks TEXT,
  amazon_sales INTEGER DEFAULT 0,
  amazon_total INTEGER DEFAULT 0,
  rakuten_sales INTEGER DEFAULT 0,
  rakuten_total INTEGER DEFAULT 0,
  yahoo_sales INTEGER DEFAULT 0,
  yahoo_total INTEGER DEFAULT 0,
  mercari_sales INTEGER DEFAULT 0,
  mercari_total INTEGER DEFAULT 0,
  base_sales INTEGER DEFAULT 0,
  base_total INTEGER DEFAULT 0,
  qoo10_sales INTEGER DEFAULT 0,
  qoo10_total INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on the date column for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_reports_date ON sales_reports(date);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE sales_reports ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on sales_reports" ON sales_reports
  FOR ALL USING (true);
