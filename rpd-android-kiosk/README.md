# Al-Rizwan Paratha Experts — Live Display + Remote

Three screens, one app:

- **`/`** — the TV/display screen. Full-screen rotating promo slides with a
  logo bumper between transitions, a QR code (bottom-right) to your menu,
  a second QR code (top-right) for the phone remote, and a gesture-controlled
  spin wheel game.
- **`/admin`** — the remote control for staff. Log in to add/remove promo
  slides (with a custom per-slide display duration), manage the wheel game's
  prizes, and change the URL the menu QR code points to.
- **`/remote`** — a public, no-login page for customers. Scan the on-screen
  QR code to spin/stop/confirm the wheel game from your phone, no hand
  gestures required.

## 1. Local setup

```bash
npm install
cp .env.example .env
# edit .env: put in your MongoDB Atlas URI, a JWT secret, and your admin login
npm start
```

Then open `http://localhost:3000` (display) and `http://localhost:3000/admin` (remote).

## 2. Neon (Postgres)

1. Create a free project at [Neon](https://neon.tech).
2. On your project's Dashboard, click **Connect** and copy the connection
   string — it looks like:
   ```
   postgresql://user:password@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Paste it into `DATABASE_URL` (locally in `.env`, or as a Render
   Environment Variable in production).

No manual migration step is needed — the app creates its `slides` and
`config` tables automatically the first time it starts up (see `db.js`).

## 3. Deploying on Render

1. Push this project to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add:
   - `DATABASE_URL` (your Neon connection string, with `?sslmode=require`)
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
server.js            Express app: public + admin API, remote-control sync, serves /public
db.js                 Neon/Postgres pool + schema setup (slides, config, wheel_segments tables)
public/index.html     display screen (full-screen slides, logo bumper, wheel game)
public/admin.html     staff remote/admin panel
public/remote.html    customer phone remote for the wheel game
public/logo.jpg        brand logo (favicon + on-screen badge)
```

## LED / Android-TV sizing fix

If the logo, logo bumper, or spin-wheel elements ever look oversized again on
a particular box, it's almost always the browser mis-reporting its viewport
width on a large screen (common on cheap Android TV boxes / kiosk-browser
apps) and then zooming the page to fill the screen. `public/index.html` now
forces the viewport to the box's real `screen.width`/`screen.height` on load
and on resize (see the script right under the `<meta name="viewport">` tag in
`<head>`) so this shouldn't recur, but if it does, that's the first place to
look — and try toggling the kiosk browser's own "desktop site" / "page zoom"
setting off, since some apps expose one that can override this.

## Notes on the newer features

- **Per-slide timing:** each slide can have its own display duration in
  seconds, set in `/admin`. Leave it blank and it falls back to 3 seconds.
- **Gesture control accuracy:** hand-gesture recognition depends on camera
  placement and lighting — watch the small "gesture: …" debug label at the
  bottom-left of the display screen after deploying, and it can be tuned
  further if certain gestures are being over/under-triggered.
- **Phone remote sync** uses a lightweight in-memory channel on the server
  (no database table), since Render's free tier runs a single instance.
  If you ever scale to multiple instances, this would need to move to a
  shared store (e.g. a Postgres table or Redis) instead.
