CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pen_name TEXT NOT NULL DEFAULT 'Anonymous',
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL,
  contact_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'review', 'rejected')),
  review_reasons TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stories_status_published
  ON stories(status, published_at DESC);
