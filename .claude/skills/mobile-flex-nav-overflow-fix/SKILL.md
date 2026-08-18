---
name: mobile-flex-nav-overflow-fix
description: Fix mobile horizontal scroll and flexbox wrapping regressions by identifying nowrap content and using margin-left auto to keep nav items right-aligned when they wrap.
---

# mobile-flex-nav-overflow-fix

**When mobile nav items disappear or collapse to the left after adding `flex-wrap`, check for fixed-width or `white-space: nowrap` content forcing horizontal scroll, then apply margin-based alignment.**

## The pattern

### 1. Root-cause diagnosis

Horizontal scroll on mobile that hides nav buttons usually comes from **fixed-width or `nowrap` content inside the nav**, not the nav layout itself. Examples:
- Monospace helper text with `white-space: nowrap` 
- Icons or buttons with `min-width` set
- Breadcrumbs or labels that don't break

At that width/font-size, they render wider than the viewport, forcing the whole page to scroll horizontally and pushing right-aligned items off-screen.

**Verify:** Inspect the nav in DevTools mobile view, toggle each element's `display` until the scroll disappears.

### 2. Multi-part fix

#### A. Hide or wrap the culprit (under mobile breakpoint, e.g., 600px)

```css
@media (max-width: 600px) {
  .dev-message-container { display: none; }
  /* or if you want to keep it: */
  .dev-message { white-space: normal; word-wrap: break-word; }
}
```

#### B. Allow nav to wrap instead of overflow

```css
nav {
  display: flex;
  flex-wrap: wrap;      /* key: allow wrapping */
  gap: 16px;            /* gap scales with wrap */
  justify-content: space-between;
}
```

#### C. Safety net: prevent any overflow from scrolling

```css
html {
  overflow-x: hidden;   /* catches stray overflow */
}
body {
  max-width: 100vw;     /* prevent scrollbar width creep */
  overflow-x: hidden;
}
```

#### D. Pin right-side items when they wrap

```css
.nav-right {
  margin-left: auto;    /* crucial when flex-wrap is on */
}
```

Without `margin-left: auto`, a single item on a wrapped line defaults to the line's start (left edge) under `justify-content: space-between`. The margin pushes it right.

### 3. Avoid the regression

**Don't do this:**
```css
nav { 
  justify-content: space-between;  /* works single-line only */
  flex-wrap: wrap;
}
.nav-right { /* no margin */ }
```
→ When `.nav-right` wraps to its own line, `space-between` has no reference; item collapses left.

**Do this:**
```css
nav { 
  flex-wrap: wrap;
}
.nav-right { 
  margin-left: auto;  /* works single-line AND wrapped */
}
```

## Real example

From creative.html fix:
- **Problem:** `.dev-message` with `white-space: nowrap` rendered 400px+, forced horizontal scroll, hid mute/mode toggles.
- **Solution:** Hide messages under 600px, add `nav { flex-wrap: wrap; }`, add `.nav-right { margin-left: auto; }`.
- **Result:** Toggles stay pinned right on phone whether nav is single-line (desktop) or wrapped (mobile).