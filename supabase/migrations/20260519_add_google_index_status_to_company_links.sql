ALTER TABLE company_links
ADD COLUMN IF NOT EXISTS google_index_status TEXT
  CHECK (google_index_status IN ('indexed', 'requested', 'not_indexed')),
ADD COLUMN IF NOT EXISTS google_index_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS google_index_note TEXT;
