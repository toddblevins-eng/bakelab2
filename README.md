# BakeLab — Operations Guide

Everything you need to find, run, and change the BakeLab app. If you've forgotten
where anything lives, start here.

BakeLab is the House au Pain production app (recipes, levain/Thelma calibration,
bake-day scheduling, Gantt timelines, food-safety logs). It's a web app installed
to your phone and Mac, backed by a cloud database so both devices share the same data.

**Stack:** Vite + React (the app) · vite-plugin-pwa (makes it installable/offline) ·
Supabase (database + sign-in) · hosted on Vercel · code on GitHub.

---

## Your three control panels

These are the only places you ever need to go. Bookmark all three.

### 1. GitHub — the code
**https://github.com/toddblevins-eng/bakelab2**
Holds every file of the app. This is where you upload a new version of the app when
you want to change it. The app component itself is the file **`src/BakeLab.jsx`**.

### 2. Vercel — hosting & deploys
**https://vercel.com/todd-blevins-projects1/bakelab2**
Takes the code from GitHub and publishes it to the internet. Every time GitHub
changes, Vercel automatically rebuilds and re-publishes within about a minute.
Plan: Hobby (free). This is also where the two secret connection settings live
(see "Settings reference").

### 3. Supabase — database & sign-in
**https://supabase.com/dashboard/project/jgdvjzhhdfrzljipaio**
The cloud database that stores all your bake days, recipes, Thelma's profile, and
logs, and handles the email sign-in. Project name: **BakeLab_Cloud**. Plan: Free.

Handy deep links inside Supabase:
- See your actual data: **https://supabase.com/dashboard/project/jgdvjzhhdfrzljipaio/editor** (open the `kv` table)
- Sign-in URL settings: **https://supabase.com/dashboard/project/jgdvjzhhdfrzljipaio/auth/url-configuration**
- API keys: **https://supabase.com/dashboard/project/jgdvjzhhdfrzljipaio/settings/api-keys**

---

## The live app

**https://bakelab2.vercel.app**

Installed as an app on:
- iPhone (Safari → Share → Add to Home Screen)
- Mac (Chrome → Install)

You sign in once per device with your email (todd.blevins@gmail.com) and stay
signed in.

---

## How to change the app (the loop you'll use most)

When you want new features or fixes:

1. Claude gives you an updated **`src/BakeLab.jsx`** file.
2. Go to the GitHub repo → open the `src` folder → open `BakeLab.jsx` →
   use **Add file → Upload files** (or the edit pencil) to replace it → **Commit**.
3. Vercel notices the change and redeploys automatically (~1 minute).
4. Refresh to see it: on Mac hold **Shift** and click reload; on iPhone the app
   updates on its next launch or two. (If it's stubborn, see "Gotchas".)

That's the whole loop. You almost never touch Vercel or Supabase once they're set up.

---

## Settings reference

| Thing | Value / where it lives |
|---|---|
| GitHub repo | `toddblevins-eng/bakelab2` |
| Vercel project | `bakelab2` (team: todd-blevins-projects1) |
| Live URL | `https://bakelab2.vercel.app` |
| Supabase project ref | `jgdvjzhhdfrzljipaio` |
| Supabase URL | `https://jgdvjzhhdfrzljipaio.supabase.co` |
| Region | us-east-1 (East US, N. Virginia) |
| App component file | `src/BakeLab.jsx` |
| Sign-in method | Email magic link |
| Auth Site URL (Supabase) | `https://bakelab2.vercel.app` |
| Auth Redirect URL (Supabase) | `https://bakelab2.vercel.app/**` |

**Connection settings (in Vercel → project → Settings → Environments):**
- `VITE_SUPABASE_URL` = the Supabase URL above
- `VITE_SUPABASE_ANON_KEY` = the Supabase **publishable** key (`sb_publishable_…`)

> If you ever change an environment variable in Vercel, you must **redeploy** for it
> to take effect (Vercel → Deployments → ⋯ on the latest → Redeploy).

---

## Secrets — what's safe and what's not

- **Safe to be public** (these are already inside the shipped app): the Supabase
  URL, the project ref, and the **publishable** key (`sb_publishable_…`). No harm if
  anyone sees them — the database's security rules protect your data.
- **NEVER share or post anywhere**: the Supabase **secret** key (`sb_secret_…`) and
  your **database password**. You don't need either for normal use. If one ever
  leaks, rotate it in Supabase.

This is why this guide pastes no key values — the real ones live only in Vercel
(the publishable key) and Supabase (everything else).

---

## Gotchas we hit (so future-you doesn't relive them)

- **App still shows the old version after a deploy.** It's the installed app caching
  itself. Fixes: on Mac, hard-refresh (Shift + reload), or Chrome DevTools →
  Application → Service Workers → Unregister, then reload. On iPhone, delete the
  home-screen app and re-add it. An **Incognito window always shows the true latest
  version** — use it to tell whether a problem is caching or code.
- **"email rate limit exceeded" on sign-in.** Too many link requests too fast.
  Wait 30–60 minutes, then request **one** link. Don't spam the button.
- **Sign in on your phone first.** The first device you sign into becomes the master
  copy that seeds the cloud. Your phone holds your real kitchen data, so always sign
  in there first; other devices then pull from the cloud.
- **Magic-link email points at localhost.** That means the Supabase **Site URL** got
  reset to localhost — set it back to `https://bakelab2.vercel.app`.
- **Redirect URL must be one clean entry.** `https://bakelab2.vercel.app/**` — watch
  for accidentally pasting the address twice into one field.

---

## Your data

It lives in the cloud now, in a Supabase table called **`kv`**. To look at it:
Supabase → Table Editor → `kv`. You'll see a couple of rows (one for your recipes
and settings, one for your bake days) — each holds a blob of saved data.

**Backups:** the free plan has no automatic backups. Your data is safely in the
cloud and synced across devices, but if you wanted belt-and-suspenders protection
you could periodically export the `kv` table from the Table Editor, or upgrade the
Supabase plan later for automatic backups. Low priority for now.

---

## When you need help

Come back to Claude with the specifics — what you were doing, what you clicked, and
a screenshot of any error. That's how we got through setup, and it's the fastest way
through anything new.
