# MTSS Behavior Log — How to access each page

## Cloudflare (Pages + Worker)

The **frontend uses the Worker origin directly** for API calls. No Cloudflare route is required: the Pages site (e.g. `https://tmsnuggets.pages.dev`) and the Worker (e.g. `https://mtss-behavior-log.mrradle.workers.dev`) are different origins; the frontend in `public/api.js` sets `API_ORIGIN` to the Worker URL and all `/api/*` requests go there. The Worker sends CORS headers so the browser allows cross-origin requests from the Pages domain. Page navigation uses static files: `index.html` (Logger), `teacher.html`, `store.html`.

---

## Google Apps Script (legacy)

Your **main deployment** has one URL. Append `?page=...` to open different parts of the app.

## Main app (one deployment URL)

Replace `YOUR_SCRIPT_URL` with your actual deployed URL (e.g. `https://script.google.com/macros/s/xxxxx/exec`).

| What you want | URL |
|---------------|-----|
| **Home (launcher)** — links to all pages | `YOUR_SCRIPT_URL?page=home` |
| **Logger** — log positive/concern | `YOUR_SCRIPT_URL` or `YOUR_SCRIPT_URL?page=logger` |
| **Teacher dashboard** | `YOUR_SCRIPT_URL?page=teacher` |
| **School store** | `YOUR_SCRIPT_URL?page=store` |
| **Admin (full)** — edit data, tags, etc. | `YOUR_SCRIPT_URL?page=admin` |

**Easiest:** Bookmark **`YOUR_SCRIPT_URL?page=home`**. Open it once; from there you can click Logger, Teacher, Store, or Admin.

---

## Read-only admin (optional second deployment)

If you use **Code-Admin-ReadOnly.gs** for a view-only admin:

1. Create a **new** Google Apps Script project (e.g. “MTSS Admin Read-Only”).
2. Copy into it: **Code-Admin-ReadOnly.gs** and **Admin.html**.
3. In the new project, add a single file (e.g. `Main.gs`) with:
   ```js
   function doGet() { return doGetAdminReadOnly_(); }
   ```
4. Deploy that project as a web app. That deployment URL is your **read-only admin** (no edits, no sheet writes).

---

## After changing code

Redeploy: **Deploy → Manage deployments → Edit (pencil) → New version → Deploy.**  
Then reload your bookmarked URLs.
