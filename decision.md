# Decisions Made While Reviewing and Fixing

This document records the judgment calls made while triaging the code review findings and applying fixes — what was fixed, what was intentionally left alone, and why.

## 1. Fixed all 6 findings from the review
All 6 findings from the background code review were confirmed as real, reproducible bugs (not stylistic nitpicks), so all were fixed rather than triaged down:
- Hero image aspect-ratio mismatch (CLS regression)
- `projects.html` broken `onload` quoting
- `projects.html` missing canonical tag / wrong `og:url`
- `fetch-bento.js` alt text discarding real captions
- `fetch-bento.js` unescaped HTML interpolation
- `creative-bento.html` mute button not silencing the charge oscillator

Two of these (missing canonical + wrong `og:url`) were reported as one finding on `projects.html` but are logically separate issues; both were fixed in the same edit since they're adjacent lines in the same `<head>` block.

## 2. Used real intrinsic pixel dimensions for hero image `width`/`height`, not the previous placeholder values
The three hero images have genuinely different aspect ratios (0.63, 1.10, 0.60) because they're different photos, not crops of the same shot. Rather than picking one arbitrary "correct" ratio for all three, each `<img>` now declares its own actual file dimensions (confirmed with `sips`). This is correct because:
- `slide-1` (`profile1.webp`) is the only image still in normal document flow (`position: relative`); it determines the `.hero-image-container` box height that the browser reserves before any image loads.
- `slide-2`/`slide-3` are `position: absolute; width:100%; height:100%`, so their CSS-computed box doesn't depend on their HTML `width`/`height` attributes at all — but giving them correct values too is harmless and keeps the markup honest/consistent for any future CSS change that relies on intrinsic size.
- I did not change the CSS (`max-height: 450px`, `object-fit: contain`) — that governs the *visual* size and was already working as intended; only the *reserved layout box* was wrong.

## 3. Extended HTML-escaping beyond the two literally-flagged interpolation points
The review flagged unescaped `altText` and `optimizedUrl`. While fixing this, I also escaped `title` (used in `<div class="caption-title">${title}</div>`), even though it wasn't separately called out. Reasoning: it's the exact same root cause (unsanitized Cloudinary-sourced string interpolated into generated HTML) and the exact same script — leaving one of the three sibling interpolation points unescaped would mean the fix is incomplete for its own stated purpose. This was judged as "same bug, one root-cause fix" rather than scope creep.

I did not add escaping to `item.width`/`item.height` (used as bare numeric attribute values) since these come from Cloudinary's API as numbers, not free-text — there's no realistic injection vector there, and adding defensive code for an impossible input would be unnecessary complexity.

## 4. Did not re-run `fetch-bento.js` against live Cloudinary
The script fixes (caption-preferring alt text, escaping) only affect *future* regenerations of `creative.html` — it's re-run automatically every hour by `.github/workflows/cloudinary-sync.yml`. I did not attempt to run it locally because:
- It requires live `CLOUDINARY_*` credentials in `.env`, which aren't part of this fix and shouldn't be invoked speculatively.
- Running it would rewrite `creative.html`'s generated block as a side effect outside the scope of "fix the bug," and is better left to the existing scheduled CI job, which will pick up the corrected logic on its next run.

## 5. Mute-button fix reuses the existing `cancelChargeSound()` function rather than adding new state
`cancelChargeSound()` already existed and is called from three other places (touch-cancel-by-scroll, explosion trigger, pointer-up). Rather than inventing a new code path to silence `chargeOsc`/`chargeGain` from the mute handler, the fix calls this existing function — it's already idempotent (`if (chargeOsc && audioCtx)` guard) and already does exactly what's needed (ramp gain to 0, stop and null the oscillator). This keeps the fix minimal and consistent with the rest of the file's pattern instead of introducing a parallel mechanism.

I did not reset `isMouseDown`/`blackHoleCharge` from the mute handler — muting is about audio only; the charge-and-explode gesture itself (visual/haptic) should keep working silently if the user keeps holding after muting. Killing the gesture state would be an unrequested behavior change.

## 6. `projects.html` canonical URL and `og:url` point at `/projects.html`, matching the pattern on every other page
Checked `creative.html`, `creative-bento.html`, `blogs.html`, and `links.html` — every existing page has a self-referencing canonical (`https://shubhuu.in/<page>.html`) and a matching `og:url`. `index.html` is the only page canonicalized to the bare domain root (`https://shubhuu.in/`), since it *is* the root. `projects.html` is not the root, so it follows the self-referencing pattern used by every other non-root page, not `index.html`'s special case.
