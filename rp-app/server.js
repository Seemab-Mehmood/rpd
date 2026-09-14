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

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // images arrive as base64 in the JSON body

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
app.get('/api/slides', async (req, res) => {
  const slides = await Slide.find().sort({ createdAt: -1 });
  const active = slides.filter((s) => s.isActive());
  res.json(active.map((s) => ({ image: s.image, tag: s.tag, sub: s.sub })));
});

app.get('/api/config', async (req, res) => {
  const cfg = (await Config.findOne({ key: 'site' })) || (await Config.create({ key: 'site' }));
  res.json({ menuUrl: cfg.menuUrl });
});

// ---------- admin auth ----------
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  const userOk = timingSafeEqual(username || '', ADMIN_USERNAME);
  const passOk = timingSafeEqual(password || '', ADMIN_PASSWORD);
  if (userOk && passOk) {
    return res.json({ token: signToken() });
  }
  res.status(401).json({ error: 'Wrong username or password' });
});

// ---------- admin: promo slides ----------
app.get('/api/admin/slides', requireAdmin, async (req, res) => {
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
});

app.post('/api/admin/slides', requireAdmin, async (req, res) => {
  const { image, tag, sub, hoursActive } = req.body || {};
  if (!image) return res.status(400).json({ error: 'An image is required' });
  const slide = await Slide.create({
    image,
    tag: tag || 'Special Offer!',
    sub: sub || '',
    hoursActive: Number(hoursActive) || 0,
  });
  res.status(201).json({ id: slide._id });
});

app.delete('/api/admin/slides/:id', requireAdmin, async (req, res) => {
  await Slide.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------- admin: site config (menu URL behind the QR code) ----------
app.put('/api/admin/config', requireAdmin, async (req, res) => {
  const { menuUrl } = req.body || {};
  if (!menuUrl) return res.status(400).json({ error: 'menuUrl is required' });
  const cfg = await Config.findOneAndUpdate(
    { key: 'site' },
    { menuUrl },
    { upsert: true, new: true }
  );
  res.json({ menuUrl: cfg.menuUrl });
});

// ---------- static pages ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
