# Al-Rizwan Paratha Experts — Live Display + Remote

Two screens, one app:

- **`/`** — the TV/display screen. Rotates promo slides and shows a QR code
  that links to your menu site.
- **`/admin`** — the remote control. Log in from a phone/laptop to add or
  remove promo slides, set how long each one should stay live, and change
  the URL the QR code points to.

## 1. Local setup

```bash
npm install
cp .env.example .env
# edit .env: put in your MongoDB Atlas URI, a JWT secret, and your admin login
npm start
```

Then open `http://localhost:3000` (display) and `http://localhost:3000/admin` (remote).

## 2. MongoDB

Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas), add a
database user, allow network access from anywhere (0.0.0.0/0) since Render's
IP isn't static, and copy the connection string into `MONGODB_URI`.

## 3. Deploying on Render

1. Push this project to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add:
   - `MONGODB_URI`
   - `JWT_SECRET` (any long random string)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - Render sets `PORT` itself — don't set it manually.
5. Deploy. Render gives you a URL like:

   ```
   https://rizwan-paratha-display.onrender.com
   ```

### What your two links look like

- **Display screen (put this on the restaurant TV):**
  `https://rizwan-paratha-display.onrender.com`

- **Remote/admin control (bookmark this on your phone):**
  `https://rizwan-paratha-display.onrender.com/admin`

That `/admin` link *is* the new "remote screen control" — open it, log in
with your admin username/password, and:
- Upload a photo, give it a headline (e.g. "New! Chicken Malai Wrap"), and
  choose how many hours it should run for a limited-time promo, or leave it
  blank to keep it up until you remove it.
- Update the "Menu URL" field any time you want the QR code on the TV to
  point somewhere else — the screen picks up the change automatically
  within a minute, no reboot needed.

Note: Render's free tier spins the service down after inactivity, so the
*first* load after a quiet period can take 15–30 seconds. The TV screen
should be left open in a browser tab/kiosk mode so it stays warm; the admin
page will just take a moment to log in if it's been idle.

## Files

```
server.js            Express app: public + admin API, serves /public
models/Slide.js       promo slide schema (image, headline, expiry)
models/Config.js       site config (menu URL)
public/index.html      display screen
public/admin.html      remote/admin panel
```
