# What to do next

Two parts: **setup you must do** to switch the new CMS on, and a **prioritized
backlog** of real bugs — including an assessment of the external architectural
review, which is partly already-fixed and partly inaccurate.

Every claim below was checked against the code. File:line references are real.

---

## Part 1 — Setup (blocking; nothing else matters until this is done)

The projects/academics/achievements CMS is built and tested but has no content
source yet. Until these steps are done, those pages show the placeholder HTML
committed inside the markers.

- [x] **Create three Notion databases** with the exact property names in
      [`NOTION-SETUP.md`](NOTION-SETUP.md). Names are looked up literally —
      `Tech Stack` works, `Tech stack` silently yields an empty field.
- [x] **Share each database with your integration** (`•••` → Connections).
      An unshared database returns `404`; this is the most common first-run failure.
- [x] **Add three repo secrets:** `NOTION_PROJECTS_DB_ID`,
      `NOTION_ACADEMICS_DB_ID`, `NOTION_ACHIEVEMENTS_DB_ID`.
- [x] **Migrate existing content into Notion** — 5 projects, 3 education entries,
      2 achievements. The current values are in the placeholder blocks in
      `projects.html` and `academics.html`.
- [x] **Check it with `npm run verify:notion`** before anything else. Read-only;
      reports per-database whether the integration can reach it and which
      properties are missing, mis-typed or mis-cased.
- [x] **Dry-run locally before pushing:** `npm run sync:all && git diff --stat`.

> **Gotcha worth knowing up front:** the id in your address bar
> (`app.notion.com/p/Projects-3c75...`) is the **page**, not the **database**.
> Open the table as a full page and take the id before `?v=`. `verify:notion`
> detects this specific mistake and says so.

> Renaming a project in Notion changes its slug, which changes its URL and
> deletes the old page. Fine now; worth remembering once you have inbound links.

---

## Part 2 — The external review, assessed

Overall: **the frontend findings are good and worth acting on. The build-pipeline
findings are mostly out of date** — they describe the code as it was before
today's work. One claim is half-wrong. It also missed three real bugs (Part 3).

### Already fixed today — no action needed

| Review claim | Status | Evidence |
| --- | --- | --- |
| Blank/corrupt pages if the API fails | **Fixed** | `assertNotEmpty()` in `lib/notion.js` makes every Notion generator refuse to write on zero rows. Tested. |
| Partial payload / HTTP 429 corruption | **Already safe** | `queryAllPages` throws on any non-OK response (`lib/notion.js`), and the throw happens *before* any file write. Pagination failure mid-loop aborts the whole run. |
| `undefined` in `og:image` when cover missing | **Fixed** | `fetch-projects.js`: `const image = p.cover \|\| OG_IMAGE`. Blog posts use a constant. |
| Slugs must sanitize special characters | **Already handled** | `slugify()` lowercases and collapses non-alphanumerics. But see **Bug 2** — the *empty* result is unguarded. |

### Valid and worth doing

- [x] **Pause `requestAnimationFrame` when the tab is hidden.** Confirmed: zero
      occurrences of `visibilitychange` across the entire repo. `drawCanvas()`
      (`creative.html:1454`) and `updateCursor()` (`creative.html:1025`) recurse
      forever, burning CPU and battery in a background tab.
      Fix: a `document.visibilityState` check before re-scheduling.

- [x] **Suspend the `AudioContext` when muted.** `initAudio()`
      (`creative.html:1114`) calls `resume()` but nothing ever calls `suspend()`
      or `close()`, so the audio graph stays live after muting. Minor resource
      retention, not a correctness bug.

- [ ] **Sanitize Markdown-generated HTML.** *Low priority, and be clear about why:*
      `marked` passes raw HTML through, and Notion bodies are injected unescaped
      by design (they *are* the article content). But you are the only author, so
      this is self-XSS at worst — not a vector someone else can reach. Worth doing
      for correctness (malformed HTML breaking layout) rather than security.
      Note all *property* values (titles, taglines) already go through
      `escapeHtml()` — verified with an XSS payload in a tagline.

### Assessed as partly wrong

- **"Canvas effects don't respect `prefers-reduced-motion`."** Half wrong.
  `creative.html:1562` *does* handle it — it hides the canvas and strips the tilt
  and magnetic listeners. **But it only sets `canvas.style.display='none'`, so
  the `drawCanvas()` rAF loop keeps running at full CPU, invisibly.** The
  accessibility intent is there; the CPU saving is not. That's the actual bug,
  and it's narrower and more specific than the review states. Folds into the
  visibility fix above — one guard solves both.

### Assessed as low value

- **Incremental sync via `last_edited_time`.** Technically valid, but the payoff
  is small: the sync is already idempotent (verified — a second run is
  byte-identical, so no spurious commits), and with ~5 posts the hourly cost is a
  handful of API calls. Revisit past ~50 posts, or if you start hitting Notion
  rate limits. Not worth the cache-invalidation complexity now.

---

## Part 3 — Real bugs the review missed — **all four now fixed**

Found while verifying its claims, and fixed in the same pass. Each was verified
against the real generators, not a re-implementation.

- [x] **Bug 1 — `fetch-bento.js` had no zero-results guard.** This was exactly the
      failure mode the review worried about, in the one script that still had it.
      An empty Cloudinary response — renamed folder, auth failure, transient error —
      would write an **empty gallery into `creative.html`** and `cloudinary-sync.yml`
      would commit it.
      **Fixed:** now uses the same `assertNotEmpty()` guard as the Notion generators.
      Also dropped its duplicate `escapeHtml` copy in favour of the shared one
      (`lib/notion.js` requires only `fs`, so this adds no npm dependency despite
      that workflow's `npm install cloudinary dotenv` step).
      *Verified:* simulated an empty response — `creative.html` untouched, all 38
      gallery items intact.

- [x] **Bug 2 — empty slug wrote a file called `.html`.** A post titled `!!!`,
      `---` or whitespace slugified to `""`, writing a hidden file named `.html`
      at the site root with the canonical URL `https://shubhuu.in/.html`.
      **Fixed:** `makeSlug()` falls back to the Notion page id — `untitled-cccc3333`
      — so the row still publishes at a stable URL instead of being dropped or
      corrupting the tree. Prints a warning naming the offending title.

- [x] **Bug 3 — non-ASCII titles were mangled.** `slugify('café ☕')` returned
      `'caf'`; a title in a non-Latin script returned `''` and hit Bug 2.
      **Fixed:** `slugify` now normalizes to NFKD and strips combining marks before
      the alphanumeric filter, so accents transliterate rather than vanish.
      *Verified:* `café ☕` → `cafe`, `Ünïcödé Tïtle` → `unicode-title`,
      `Naïve Café` → `naive-cafe`.

- [x] **Bug 4 — duplicate titles silently overwrote each other.** Two rows sharing
      a title produced one slug; the second write clobbered the first and a post
      vanished with no warning. Affected blogs and projects equally.
      **Fixed:** `uniqueSlug()` suffixes collisions (`-2`, `-3`) and warns, telling
      you to rename one in Notion if you want to control the URL.
      *Verified:* both duplicate-titled projects survive as separate pages.

**Determinism note:** slugs are now assigned **after** sorting rather than inside
the fetch loop, so a `-2` suffix depends on publication date, not on Notion's
response ordering. Verified stable across runs — a suffix is a URL, so it must
not drift. Re-running still produces byte-identical output, so CI won't churn.

## Suggested order

1. **Part 1 setup** — unblocks everything, no code required. *This is the only
   thing still blocking you.*
2. **rAF visibility pause** — real battery/CPU win, and it completes the
   reduced-motion intent that `creative.html:1562` only half-delivers.
3. **AudioContext suspend** — small polish.
4. Sanitization and incremental sync — only if they start to matter.

*(Parts 2 and 3 code items: the four missed bugs are done; the two frontend
items above are the remaining valid ones from the review.)*

---

## Part 4 — Project showcase: paused status (2026-09-24)

Notion mein ye update kiya:
- Table Scraper (Gumroad link), MediPlug, Gym Champion aur Viora ke live URL daale aur inhe "Live" mark kiya.
- Covers `shubhuu-projects/` folder (Cloudinary) mein hain: fin, Aarogya Grid, LPU Loop, MindCare, ASCII Art Studio, Buy Me a Chai, Gesture Power FX, MediPlug, Gym Champion, Viora, Table Scraper, SplitBill aur AgentFlow.
  - Viora: demo login karke Command Deck ka screenshot liya.
  - SplitBill: repo ke `screenshots/01-dashboard.png` se liya.
  - AgentFlow: local chala ke dashboard ka screenshot liya.

Jo atka hua hai:

- [x] **Resume Roaster (Vercel):** code ready hai — `~/Projects/resume-roaster` mein `api/roast.js`, `api/health.js`, `vercel.json` add kiye, tests pass. Bas AI API key chahiye (Anthropic / Gemini / OpenRouter).
  - Key Vercel mein add karo (`vercel env add ANTHROPIC_API_KEY production`) ya batao kaunsi use karni hai.
  - Default model `claude-3-haiku-20240307` purana hai → `claude-haiku-4-5` pe set karna hai.
  - Deploy ke baad Notion mein naya URL + screenshot lagana hai, aur URL ke shuru wala tab character saaf karna hai.
  - **Done (2026-10-01):** Gemini 3.5 Flash pe live — https://resume-roaster-neon-mu.vercel.app, Notion Live URL updated.
- [x] **ModelHive:** *(AI-generated cover laga diya, screenshot ki zaroorat nahi.)* koi web UI nahi, terminal tool hai. Ek run = Ollama + Claude Code + Gemini CLI + Copilot CLI, 5 rounds, quota + 10–30 min. Ya README architecture ka terminal-style cover image banana hai.
- [x] **Second Brain:** *(AI-generated cover laga diya, screenshot ki zaroorat nahi.)* web app "Loading…" pe atakta hai, Rust API server chahiye. Throwaway data dir ke saath chalane ki koshish ki, par release build `sqlx` macro dylib ke linker error ("mis-aligned LINKEDIT string pool") pe fail hua. Options: `target/release` saaf karke debug build, ya desktop app ka apna screenshot (bina personal data).

Local changes jo commit nahi hue:
- `~/Projects/resume-roaster`: Vercel ke naye files.
- `~/Projects/ModelHive`: naya clone.
- `~/Projects/AgentFlow/frontend`: `node_modules` install.
- `shubhuu-site/project-screenshots/`: images Cloudinary pe hain, commit karne ki zaroorat nahi.
