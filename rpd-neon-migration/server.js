require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { pool, initSchema, isActive, toSlideJson } = require('./db');

const {
  PORT = 3000,
  JWT_SECRET = 'change-me-please',
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD = 'change-me-please',
} = process.env;

// Never let one bad request take the whole process down.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // images arrive as base64 in the JSON body

// Wrap async route handlers so thrown/rejected errors go to Express's error
// handler (below) instead of becoming unhandled rejections.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- auth helpers ----------
function signToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- public API (used by the display screen) ----------
app.get('/api/slides', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM slides ORDER BY created_at DESC');
  const active = rows.filter(isActive);
  res.json(active.map((r) => toSlideJson(r)));
}));

app.get('/api/config', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT menu_url FROM config WHERE key = $1', ['site']);
  res.json({ menuUrl: rows[0]?.menu_url || '' });
}));

// ---------- admin auth ----------
app.post('/api/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const userOk = timingSafeEqual(username || '', ADMIN_USERNAME);
  const passOk = timingSafeEqual(password || '', ADMIN_PASSWORD);
  if (userOk && passOk) {
    return res.json({ token: signToken() });
  }
  res.status(401).json({ error: 'Wrong username or password' });
}));

// ---------- admin: promo slides ----------
app.get('/api/admin/slides', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM slides ORDER BY created_at DESC');
  res.json(rows.map((r) => toSlideJson(r, { withAdminFields: true })));
}));

// Postgres TEXT columns comfortably hold far more than base64 images need,
// but we still cap uploads so a huge file fails with a clear 400 instead of
// a slow write.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

app.post('/api/admin/slides', requireAdmin, wrap(async (req, res) => {
  const { image, tag, sub, hoursActive } = req.body || {};
  if (!image) return res.status(400).json({ error: 'An image is required' });
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Image must be a data URL' });
  }
  if (Buffer.byteLength(image, 'utf8') > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: 'Image is too large — try a smaller photo' });
  }
  const { rows } = await pool.query(
    `INSERT INTO slides (image, tag, sub, hours_active)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [image, tag || 'Special Offer!', sub || '', Number(hoursActive) || 0]
  );
  res.status(201).json({ id: rows[0].id });
}));

app.delete('/api/admin/slides/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM slides WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- admin: site config (menu URL behind the QR code) ----------
app.put('/api/admin/config', requireAdmin, wrap(async (req, res) => {
  const { menuUrl } = req.body || {};
  if (!menuUrl) return res.status(400).json({ error: 'menuUrl is required' });
  const { rows } = await pool.query(
    `INSERT INTO config (key, menu_url) VALUES ('site', $1)
     ON CONFLICT (key) DO UPDATE SET menu_url = EXCLUDED.menu_url
     RETURNING menu_url`,
    [menuUrl]
  );
  res.json({ menuUrl: rows[0].menu_url });
}));

// ---------- static pages ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- error handling (always returns JSON, never an HTML error page) ----------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Request error:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

initSchema()
  .then(() => {
    console.log('Connected to Neon and verified schema');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  });
