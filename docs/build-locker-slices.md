# Locker build slices (`build-locker.cjs`)

Permanent reference for how **`apps/lantern-app/locker.html`** is assembled from **`locker-sources/index.full.html`** and **`locker-sources/store.full.html`**.

**Builder:** `apps/lantern-app/build-locker.cjs`  
**Command:** from `apps/lantern-app`:

```bash
node build-locker.cjs
```

**Overview / modals from index:** the script reads `index.full.html` as a **single string** and extracts HTML **between paired HTML comment markers** (`LOCKER_BUILD:*`). It does **not** use line-number arrays or `ix.slice(...)` for those fragments.

---

## 1. `LOCKER_BUILD:*` markers (`index.full.html`)

Markers live in **`apps/lantern-app/locker-sources/index.full.html`**. Each **START** comment may include extra text after the token (e.g. an em dash and description) before `-->`. Extraction takes everything **after** that START comment’s closing `-->` up to (but not including) the **END** comment line.

| Marker | Constant in script | Role |
|--------|-------------------|------|
| **`LOCKER_BUILD:OVERVIEW_START`** | `MARK_OVERVIEW_START` (`<!-- LOCKER_BUILD:OVERVIEW_START`) | Opens the block spliced into **`#lockerPanelOverview`**: student picker through **`#profileView`** close. |
| **`LOCKER_BUILD:OVERVIEW_END`** | `MARK_OVERVIEW_END` (`<!-- LOCKER_BUILD:OVERVIEW_END -->`) | Closes the overview region **before** the standalone **`#classAccessContentWrap`** close used on the full index page. |
| **`LOCKER_BUILD:MODALS_START`** | `MARK_MODALS_START` (`<!-- LOCKER_BUILD:MODALS_START`) | Opens the modal stack (beta report through avatar crop). |
| **`LOCKER_BUILD:MODALS_END`** | `MARK_MODALS_END` (`<!-- LOCKER_BUILD:MODALS_END -->`) | Ends after **`#avatarCropOverlay`** and **before** the extra **`</div>`** that closes **`.wrap.lanternContent`** on the full page. |

**Pairing:** keep each START/END pair in sync when editing `index.full.html`. Moving or deleting markers without updating both ends will break the build or produce invalid HTML.

**Post-extract replace (modals only):** **`Profile` → `Locker`** on the beta-report page `<option>` (same as before marker-based extraction).

**`verifyBlock`:** the builder sets this to an **empty string**. The locker template already emits **`#classAccessBannerEl`**, gate, and **`#classAccessContentWrap`**; the old verify-banner splice duplicated or truncated structure, so it is not spliced from index.

---

## 2. Build-time safety checks (`build-locker.cjs`)

The script **throws** and does not write a half-broken **`locker.html`** when checks fail.

| Check | What fails |
|-------|------------|
| **Missing START marker** | `indexOf` on the START prefix returns −1. |
| **Unclosed START comment** | No `-->` after the START prefix (malformed comment). |
| **Missing END marker** | END string not found after the START block. |
| **END before START** | END position not strictly after extracted content start. |
| **Empty fragment** | Trimmed overview or modals body is empty. |
| **Document / style leakage** | Fragment matches `<html`, `<head`, `<body`, `</head>`, `</style>`, or `<style` (unexpected shell or stylesheet spill — e.g. markers drifted into `<style>`). |
| **Overview shape** | `overviewMain` must contain **`id="pickerCard"`** and **`id="profileView"`**. |
| **Modals shape** | `modals` must contain **`id="betaReportOverlay"`**, **`id="avatarCropOverlay"`**, and **`id="editProfileOverlay"`**. |

---

## 3. Store fragment (`store.full.html`) — **unchanged, separate path**

Store is **not** extracted with `LOCKER_BUILD:*` markers. It uses **`store.full.html`** line-split into **`st[]`**, then **structure-based** bounds (unchanged from the pre–overview-marker design):

| Piece | Logic |
|-------|--------|
| **Start** | First line matching **`/^\s*<div class="titleRow">/`** (store body HTML, not CSS). |
| **End** | Line index of **`id="storePurchaseOverlay"`**, then step backward: skip blanks, remove two trailing **`</div>`** lines (standalone page **contentWrap** + **wrap** closes before the store purchase overlay). |
| **Replace** | `id="dailyHuntNuggetEl"` → `id="storeDailyHuntNuggetEl"` in the fragment (avoid duplicate IDs on the combined locker page). |

If **`titleRow`** or **`storePurchaseOverlay`** cannot be found, the builder throws.

---

## 4. Why numeric line slices were removed for index fragments

Adding lines above a region (especially in **`<head>`** or **`<style>`**) used to shift fixed **`ix.slice(start, end)`** boundaries so the “overview” slice could start **inside a stylesheet**, leaking raw CSS into **`#lockerPanelOverview`**. **Comment markers** bound the real DOM regions regardless of how many lines appear above them.

---

## 5. Rerun rule

After **any** edit to:

- **`apps/lantern-app/locker-sources/index.full.html`**, or  
- **`apps/lantern-app/locker-sources/store.full.html`**,  

regenerate the committed output:

```bash
cd apps/lantern-app
node build-locker.cjs
```

Then **diff `locker.html`** and smoke-test Overview / Items / Store and modals in the browser.

---

## 6. Maintenance

- **Index:** when changing picker, profile, or modal markup, keep **`LOCKER_BUILD`** START/END comments at the correct DOM boundaries; run the builder and fix any assertion errors.
- **Store:** keep **`titleRow`** and **`storePurchaseOverlay`** findable and the expected **`</div>`** pair before the overlay, or the store fragment step will throw.

When in doubt, inspect **`locker.html`** nesting (especially **`#classAccessContentWrap`**, **`#lockerPanelOverview`**, modals, **`#toast`**) and confirm **no duplicate IDs**.

---

## 7. Related paths

| Path | Purpose |
|------|---------|
| `apps/lantern-app/build-locker.cjs` | Assembly script, marker constants, extraction + validation |
| `apps/lantern-app/locker.html` | Generated output (commit after regen) |
| `apps/lantern-app/locker-sources/index.full.html` | Profile / overview / modals source + `LOCKER_BUILD:*` markers |
| `apps/lantern-app/locker-sources/store.full.html` | Standalone store source |
