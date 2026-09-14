const mongoose = require('mongoose');

/**
 * A promo/campaign slide the admin uploads.
 *
 * image: base64 data URL (e.g. "data:image/jpeg;base64,...") — stored directly
 * in the database so nothing depends on the server's local disk.
 *
 * hoursActive: how many hours this slide should stay in the screen's rotation
 * for, starting from createdAt. 0 or null = stays active until deleted.
 */
const slideSchema = new mongoose.Schema({
  image: { type: String, required: true },
  tag: { type: String, default: 'Special Offer!' },
  sub: { type: String, default: '' },
  hoursActive: { type: Number, default: 0 }, // 0 = no expiry
  createdAt: { type: Date, default: Date.now },
});

slideSchema.methods.expiresAt = function () {
  if (!this.hoursActive) return null;
  return new Date(this.createdAt.getTime() + this.hoursActive * 60 * 60 * 1000);
};

slideSchema.methods.isActive = function () {
  const exp = this.expiresAt();
  return !exp || exp > new Date();
};

module.exports = mongoose.model('Slide', slideSchema);
