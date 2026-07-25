const { neon } = require("@neondatabase/serverless");

let _sql = null;

function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL env var is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

async function init() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      watch_seconds INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS vouchers (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      is_used INTEGER DEFAULT 0,
      used_at TIMESTAMPTZ,
      used_by_mac TEXT,
      duration TEXT DEFAULT '1h',
      mikrotik_status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Migrate existing rows
  await db`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '1h'`;
  await db`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS mikrotik_status TEXT DEFAULT 'synced'`;
  await db`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `;
  await db`
    INSERT INTO settings (key, value) VALUES
      ('watch_seconds', '30'),
      ('portal_title', 'Blue OX WiFi'),
      ('portal_subtitle', 'Watch a short video to get free internet access.')
    ON CONFLICT (key) DO NOTHING
  `;
  console.log("Database ready");
}

module.exports = { sql, init };
