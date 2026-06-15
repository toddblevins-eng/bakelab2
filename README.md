# BakeLab · House au Pain

Production planning studio for House au Pain — recipes, levain calibration (Thelma),
bake-day scheduling, Gantt timelines, and food-safety logs. Installable to your phone
as an app, works offline.

This is the **Tier 1** packaging of the BakeLab artifact: the app component runs
unchanged; a small storage shim swaps the sandbox's `window.storage` for the browser's
`localStorage`, and a service worker makes it installable and offline-capable.

---

## Run it locally

Requires **Node.js 18+** (check with `node -v`).

```bash
npm install      # one time
npm run dev      # starts the dev server, usually http://localhost:5173
```

Open the URL it prints. On the same Wi-Fi you can also open it on your phone using the
"Network" address Vite shows (e.g. http://192.168.1.x:5173).

To make a production build and preview it exactly as it'll ship:

```bash
npm run build    # outputs to dist/
npm run preview  # serves the built app
```

---

## Deploy (free) — Vercel

1. Put this folder in a Git repo (GitHub/GitLab/Bitbucket).
2. Go to **vercel.com**, "Add New → Project", import the repo.
3. Vercel auto-detects Vite. Confirm:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Deploy. You'll get a URL like `bakelab.vercel.app`.

Netlify works identically (build `npm run build`, publish `dist`).

Every push to the repo redeploys automatically.

---

## Install to your iPhone home screen

1. Open the deployed URL in **Safari**.
2. Tap the **Share** icon → **Add to Home Screen**.
3. It launches full-screen with the BakeLab icon, no browser chrome, and opens offline.

(Android: open in Chrome → menu → **Install app**.)

---

## Your data

- All bake days, recipes, Thelma's profile, and logs are stored in your browser's
  `localStorage` on the device you use, under keys prefixed `bakelab:`.
- **This means data lives on one device and one browser.** It is not yet synced.
- Safari can evict localStorage if the app is unused for a long time. For a tool you
  rely on, **Tier 2 (cloud sync)** is the recommended next step — it makes the data
  durable and shared across your laptop and phone.

### Backing up / moving data (manual, until Tier 2)

In the browser console on the running app:

```js
// export everything
copy(JSON.stringify(Object.fromEntries(
  Object.keys(localStorage).filter(k => k.startsWith('bakelab:')).map(k => [k, localStorage[k]])
)));
// (now paste the clipboard somewhere safe)

// import on another device — paste your saved JSON in place of {...}
const data = {/* ...paste... */};
Object.entries(data).forEach(([k,v]) => localStorage.setItem(k,v));
location.reload();
```

---

## Project structure

```
index.html            # page shell + font + PWA tags
vite.config.js        # Vite + PWA (service worker, manifest) config
public/               # icons (generated from the HaP diamond mark)
src/
  main.jsx            # entry — loads the storage shim, then mounts the app
  storage-shim.js     # window.storage  ->  localStorage  (lets the app run unchanged)
  BakeLab.jsx         # the full app component (unchanged from the artifact)
  index.css           # minimal globals; the app carries its own styles
```

## Notifications (Thelma feeding reminders)

Not wired up yet. Installed PWAs on iOS can do web-push, but it's finicky; a recurring
calendar event is a zero-effort stopgap. Reliable native reminders are a **Tier 3**
(Capacitor wrapper) consideration.

## Updating the app

When you change `src/BakeLab.jsx` (or anything else), rebuild/redeploy. The service
worker is set to `autoUpdate`, so visitors get the new version on next load.
