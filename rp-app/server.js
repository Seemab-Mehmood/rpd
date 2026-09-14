require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Slide = require('./models/Slide');
const Config = require('./models/Config');

const {
  PORT = 3000,
  MONGODB_URI,
  JWT_SECRET = 'change-me-please',
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD = 'change-me-please',
} = process.env;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI env var — set it to your MongoDB Atlas connection string.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Never let one bad request take the whole process down (this is what was
// causing the 502s — an uncaught error in an async route handler used to
// crash the entire server instead of just failing that one request).
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
  const slides = await Slide.find().sort({ createdAt: -1 });
  const active = slides.filter((s) => s.isActive());
  res.json(active.map((s) => ({ image: s.image, tag: s.tag, sub: s.sub })));
}));

app.get('/api/config', wrap(async (req, res) => {
  const cfg = (await Config.findOne({ key: 'site' })) || (await Config.create({ key: 'site' }));
  res.json({ menuUrl: cfg.menuUrl });
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
  const slides = await Slide.find().sort({ createdAt: -1 });
  res.json(
    slides.map((s) => ({
      id: s._id,
      image: s.image,
      tag: s.tag,
      sub: s.sub,
      hoursActive: s.hoursActive,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt(),
      active: s.isActive(),
    }))
  );
}));

// MongoDB's hard document-size ceiling is 16MB; we cap well under that so a
// too-large upload fails with a clear 400 instead of a DB error that used to
// crash the process.
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
  const slide = await Slide.create({
    image,
    tag: tag || 'Special Offer!',
    sub: sub || '',
    hoursActive: Number(hoursActive) || 0,
  });
  res.status(201).json({ id: slide._id });
}));

app.delete('/api/admin/slides/:id', requireAdmin, wrap(async (req, res) => {
  await Slide.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---------- admin: site config (menu URL behind the QR code) ----------
app.put('/api/admin/config', requireAdmin, wrap(async (req, res) => {
  const { menuUrl } = req.body || {};
  if (!menuUrl) return res.status(400).json({ error: 'menuUrl is required' });
  const cfg = await Config.findOneAndUpdate(
    { key: 'site' },
    { menuUrl },
    { upsert: true, new: true }
  );
  res.json({ menuUrl: cfg.menuUrl });
}));

// ---------- static pages ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- error handling (always returns JSON, never Express's HTML page) ----------
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
