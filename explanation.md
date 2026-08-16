# Explanation of Bugs and Fixes

This document explains each bug found in the code review, why it happened, and exactly what was changed to fix it. See `decision.md` for the reasoning behind scope and trade-off choices made while fixing them.

---

## 1. Hero image `width`/`height` attributes didn't match real aspect ratios
**File:** `index.html` (hero slideshow images)

**Bug:** The commit's stated goal was to fix Cumulative Layout Shift (CLS) by adding explicit `width`/`height` attributes to images, so the browser can reserve the correct box before the image downloads. All three hero images (`profile1.webp`, `profile2.webp`, `profile3.webp`) were given the same placeholder values: `width="600" height="750"` (a 0.8 aspect ratio).

The actual files are:
- `profile1.webp` → 1176×1875 (ratio ≈ 0.63)
- `profile2.webp` → 1200×1095 (ratio ≈ 1.10, essentially landscape)
- `profile3.webp` → 716×1196 (ratio ≈ 0.60)

None of these match 0.8. Because `.hero-image` in CSS only sets `max-width`/`max-height` + `object-fit: contain` (no explicit CSS width/height), the browser relies on the HTML attributes to compute the reserved box. With the wrong ratio, the box collapses/expands once the real image decodes — reproducing the exact layout shift the commit was supposed to eliminate.

**Fix:** Set each image's `width`/`height` attributes to its real intrinsic pixel dimensions (confirmed via `sips`), so the browser reserves a correctly-proportioned box from the very first paint.

---

## 2. `projects.html` shipped the pre-fix, broken font-swap attribute
**File:** `projects.html`

**Bug:** The commit fixed a quoting bug in `creative.html` and `creative-bento.html`:
```html
onload="this.media="all""
```
The nested, unescaped double quotes terminate the HTML attribute early — so the browser parses this as `onload="this.media="` followed by a stray ` all""`, meaning `this.media = 'all'` never actually executes. This is the classic "preload as style, swap to `all` on load" trick for non-blocking font loading; when broken, the print-only stylesheet never becomes the active stylesheet, and (depending on browser behavior) the swap either silently fails or the font never applies via this path.

`projects.html` is a new page added in the same commit, but it still contained the old broken version — the fix wasn't propagated to it.

**Fix:** Changed to single quotes for the JS string literal, matching the already-fixed pages:
```html
onload="this.media='all'"
```

---

## 3. `fetch-bento.js` alt text discarded real captions in favor of raw filenames
**File:** `fetch-bento.js`

**Bug:** The generator script builds `alt`/`aria-label` text like this:
```js
let altText = item.filename ? item.filename.replace(/_/g, ' ') : `Gallery Image ${index}`;
```
This always uses the raw Cloudinary filename (often an auto-generated GUID, e.g. `7E842656-6915-4D51-842A-CB440B6C187B 1 105 c rvxl5a`) even when a meaningful `item.context.caption` exists (e.g. "Chowk wali holi"). The visible caption under the image showed the real caption, but the `alt` attribute — what screen readers and search engines actually read — showed the meaningless GUID. This is a worse outcome than the "duplicate alt tags" bug the commit was meant to fix.

**Fix:** Alt text now prefers the real caption, falling back to a humanized filename, then a generic label — mirroring the same priority already used for the visible caption title:
```js
const altText = escapeHtml(caption || (item.filename ? item.filename.replace(/_/g, ' ') : `Gallery Image ${index}`));
```

---

## 4. Unescaped interpolation into generated HTML attributes
**File:** `fetch-bento.js`

**Bug:** `altText`, `optimizedUrl`, and `title` were interpolated directly into template-literal HTML (`alt="${altText}"`, `src="${optimizedUrl}"`, `<div class="caption-title">${title}</div>`) with no escaping. If a Cloudinary filename or caption ever contains a `"`, `<`, `>`, or `&`, the generated markup breaks — the same class of bug as the `onload` quoting issue (#2), just at a different injection point, and one that regenerates automatically on every hourly CI run (`.github/workflows/cloudinary-sync.yml`) rather than being a one-time typo.

**Fix:** Added a small `escapeHtml()` helper and applied it everywhere untrusted Cloudinary-sourced text is interpolated into HTML: the image/video `src` URL, the `alt`/`aria-label` text, and the caption title text node.

---

## 5. Mute button didn't stop the in-progress "charge" sound
**File:** `creative-bento.html`

**Bug:** The black-hole interaction has two separate Web Audio graphs:
- `ambientGain` / `ambientOsc1` / `ambientOsc2` — the background drone, started/stopped by the mute toggle.
- `chargeOsc` / `chargeGain` — a rising tone that plays while the user is actively pressing/holding to charge a "supernova" (`startChargeSound()` / `updateChargeSound()` / `cancelChargeSound()`).

The mute button's click handler only ramped `ambientGain` to 0:
```js
if (isMuted) {
  document.body.classList.add('muted-mode');
  if (ambientGain && audioCtx) {
    ambientGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1);
  }
}
```
It never touched `chargeOsc`/`chargeGain`. So if a user pressed mute while mid-gesture (holding down to charge), the charging tone kept playing audibly until they finally released the pointer — the mute control did not actually mute everything, contradicting its expected "immediate silence" behavior.

**Fix:** Call the existing `cancelChargeSound()` helper (already used elsewhere to stop the charge tone) from inside the mute branch, so muting immediately silences both the ambient drone and any in-progress charge tone.

---

## Files changed
- `index.html` — corrected hero image `width`/`height` attributes.
- `projects.html` — fixed `onload` quoting, added canonical link, fixed `og:url`.
- `fetch-bento.js` — alt text now prefers real captions; added HTML-escaping for generated markup.
- `creative-bento.html` — mute toggle now also cancels the charge-sound oscillator.
