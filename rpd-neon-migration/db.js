const { Pool } = require('pg');

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var — set it to your Neon connection string.');
  process.exit(1);
}

// Neon requires SSL. `sslmode=require` in the connection string plus this
// option covers Neon's certificate setup.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // A lost idle connection shouldn't crash the whole server.
  console.error('Unexpected database pool error:', err);
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slides (
      id SERIAL PRIMARY KEY,
      image TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'Special Offer!',
      sub TEXT NOT NULL DEFAULT '',
      hours_active INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY DEFAULT 'site',
      menu_url TEXT NOT NULL DEFAULT 'https://www.rizwan-paratha.world'
    );
  `);

  // Make sure the single site-config row exists.
  await pool.query(`
    INSERT INTO config (key, menu_url)
    VALUES ('site', 'https://www.rizwan-paratha.world')
    ON CONFLICT (key) DO NOTHING;
  `);
}

// ---- helpers mirroring the old Mongoose instance methods ----
function expiresAt(slide) {
  if (!slide.hours_active) return null;
  return new Date(new Date(slide.created_at).getTime() + slide.hours_active * 60 * 60 * 1000);
}

function isActive(slide) {
  const exp = expiresAt(slide);
  return !exp || exp > new Date();
}

function toSlideJson(row, { withAdminFields = false } = {}) {
  const base = { image: row.image, tag: row.tag, sub: row.sub };
  if (!withAdminFields) return base;
  return {
    id: row.id,
    ...base,
    hoursActive: row.hours_active,
    createdAt: row.created_at,
    expiresAt: expiresAt(row),
    active: isActive(row),
  };
}

module.exports = { pool, initSchema, expiresAt, isActive, toSlideJson };
