const mongoose = require('mongoose');

// Single-document collection holding site-wide settings.
const configSchema = new mongoose.Schema({
  key: { type: String, default: 'site', unique: true },
  menuUrl: { type: String, default: 'https://www.rizwan-paratha.world' },
});

module.exports = mongoose.model('Config', configSchema);
