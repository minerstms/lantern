# News image upload — `Invalid base64 image` (400)

## 1. Payload shape (browser → Worker)

`POST /api/news/upload-image`  
`Content-Type: application/json`

```json
{
  "image": "<data URL or raw base64 string>",
  "mime_type": "image/png",
  "file_name": "image.png"
}
```

`image` is typically a full canvas/cropper **data URL**, e.g.  
`data:image/png;base64,iVBORw0KGgoAAAANS...`  
(contribute uses `toDataURL('image/png')` after crop).

## 2. Worker expectation (before fix)

Code stripped the prefix with:

```js
const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
```

Problems:

- Any data URL whose MIME part is not `image\/\w+` (e.g. future `image/svg+xml`, or unusual parameters) leaves the **entire** string for `atob` → **failure**.
- **Whitespace/newlines** inside the base64 payload (some clients or intermediaries) → **`atob` throws** in the Worker runtime.
- **Empty or zero-size crop** can yield a degenerate data URL; the browser path now falls back to the original file data URL (see `contribute.html` `finishCropper`).

## 3. Mismatch

Symptom: `400 {"ok":false,"error":"Invalid base64 image"}` when the image was valid in the browser.

The catch-all error masked whether the failure was **bad prefix**, **whitespace**, or **empty payload**.

## 4. Fix applied

### Worker (`lantern-worker/index.js`)

- Added `stripBase64Payload(dataUrlOrB64)`:
  - Finds `;base64,` anywhere in the string and takes the substring after it (supports `data:image/png;charset=UTF-8;base64,...` and similar).
  - Removes all whitespace/newlines from the payload before `atob`.
  - If nothing remains → `400` with **`Missing image payload`** (clearer than `Invalid base64`).
- Applied the same helper to:
  - `POST /api/news/upload-image`
  - `POST /api/avatar/upload`
  - `POST /api/news/upload-video` (consistent behavior)

### Browser (`apps/lantern-app/contribute.html`)

- **News cropper:** If `getCroppedCanvas()` is missing or has `width`/`height` 0, use **`fullNewsImageDataUrl`** instead of a broken `toDataURL` (avoids empty/invalid PNG payloads).
- **Mission cropper:** Same for zero-size canvas; fallback to **`missionCropperSourceDataUrl`** (original file read).

## 5. Proof (E2E)

After deploying Worker + Pages, Playwright against **`https://tms-lantern-beta.pages.dev/contribute`**:

- **Post + image:** `POST /api/news/upload-image` → **2xx**, then `POST /api/news/create` → **2xx**, celebration dismissed, toast **Submitted**.

Run locally:

```bash
cd e2e/studio-contribute
npx playwright test
```

(Default production base URL in `playwright.config.js`.)
