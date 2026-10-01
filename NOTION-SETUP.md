# Notion CMS Setup

What to create in Notion so the generators have something to read. Property
**names must match exactly** — the generators look them up by name.

Every property is optional except the title. A missing property renders as an
empty field rather than crashing, so you can start minimal and add columns later.

---

## 0. Layout: one page, three databases (recommended)

You can put all three databases inside a single Notion page. The generators only
query by database ID and never look at the parent, so the organisation is
entirely your choice — but one page has a real advantage: **connecting your
integration to the parent page cascades to every database inside it**, so you do
the easy-to-forget sharing step once instead of three times.

```
📄 Portfolio CMS            ← connect the integration HERE, once
   ├── 📊 Projects          ← its own id → NOTION_PROJECTS_DB_ID
   ├── 📊 Academics         ← its own id → NOTION_ACADEMICS_DB_ID
   └── 📊 Achievements      ← its own id → NOTION_ACHIEVEMENTS_DB_ID
```

Two requirements either way:

- They must be **three separate databases**, not three views of one. Type
  `/database` three times in the page (inline is fine).
- Each needs **its own ID** — see step 3. With everything on one page you have
  four similar-looking IDs in play (the page plus three databases), so it's
  easier to grab the wrong one. `npm run verify:notion` catches both a page id
  used by mistake and the same database pasted into two secrets.

---

## 1. Create the databases

### Projects → `NOTION_PROJECTS_DB_ID`

| Property | Type | What it does |
| --- | --- | --- |
| *(any name)* | **Title** | The project name. Becomes the URL: `project-<slugified-title>.html` |
| `Tagline` | Text | One-line summary. Used on the card and as the meta description. |
| `Tech Stack` | Multi-select | Tag pills, filter chips, and related-project matching. |
| `Status` | Select | Use `Live`, `In Progress`, or `Archived` — these get colour-coded badges. Other values render as a neutral badge. |
| `Live URL` | URL | The **"Visit Live Site"** button. Omit and the button disappears. |
| `Repo URL` | URL | The "View Source" button. |
| `Cover` | URL | Hero image + social share image. Paste a Cloudinary link. |
| `Gallery` | Text | Extra screenshots — paste image URLs separated by newlines, commas or spaces. |
| `Year` | Date | Sort order (newest first) and the year shown in the header. |
| `Featured` | Checkbox | Featured projects lead the homepage strip and render double-width on the explore page. |
| `Published` | Checkbox | **Unchecked rows are skipped entirely.** Your draft gate. |

The **page body** is the long-form writeup and renders below the tech stack.

### Academics → `NOTION_ACADEMICS_DB_ID`

| Property | Type | What it does |
| --- | --- | --- |
| *(any name)* | **Title** | Institution name |
| `Qualification` | Text | e.g. "B.Tech in Computer Science and Engineering" |
| `Period` | Text | e.g. "2025 — Present" |
| `Location` | Text | e.g. "Jalandhar, Punjab" |
| `Score` | Text | e.g. "CGPA: 8.56" — rendered as an accent-coloured chip |
| `Order` | Number | Sort key, **highest first**. Put your most recent qualification highest. |
| `Published` | Checkbox | Draft gate |

The top two entries also appear on the homepage.

### Achievements → `NOTION_ACHIEVEMENTS_DB_ID`

| Property | Type | What it does |
| --- | --- | --- |
| *(any name)* | **Title** | Achievement name |
| `Issuer` | Text | e.g. "TECH VEDA", "Hackathon" |
| `Description` | Text | One or two sentences |
| `Date` | Date | Sort order (newest first) and the displayed date |
| `Credential URL` | URL | Adds a "View credential" link |
| `Published` | Checkbox | Draft gate |

---

## 2. Share each database with your integration

In Notion: **•••** → **Connections** → add your integration.

If all three live inside one page (step 0), do this **once on the parent page** —
child databases inherit the connection. Otherwise repeat it per database.

**This is the most common first-run failure.** A database that exists but isn't
shared returns `404` from the API, and the generator will tell you so.

---

## 3. Get each database ID (the part people get wrong)

**The ID in your browser's address bar is usually the wrong one.**

If you made a page and dropped a table inside it, you have *two* objects: the
wrapper **page** and the **database** block. The address bar shows the page:

```
app.notion.com/p/Projects-3c75bbe5854a80ac8349f9636faaa9f4
                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                           this is the PAGE id — using it returns 404
```

To get the database id: hover the table → click **⤢ Open as full page** (or
`•••` → **Copy link to view**). The URL becomes:

```
notion.so/3c75bbe5854a80ac8349f9636faaa9f4?v=8a1f...
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          this is the DATABASE id — everything before "?v="
```

You can paste the whole URL into `.env`; the checker in step 5 strips it down.

> Naming the database itself `NOTION_PROJECTS_DB_ID` is harmless — the
> generators never read the title — but that string is the name of the *secret*,
> not the database. Call it `Projects`.

## 4. Add the repo secrets

**Settings → Secrets and variables → Actions**, using the same integration token
already in `NOTION_API_KEY`:

- `NOTION_PROJECTS_DB_ID`
- `NOTION_ACADEMICS_DB_ID`
- `NOTION_ACHIEVEMENTS_DB_ID`

## 5. Check your work

```bash
npm run verify:notion
```

Read-only. For each database it reports whether the integration can reach it,
and which expected properties are present, missing, mis-typed or mis-cased. It
specifically detects a page id pasted where a database id belongs, and
case-mismatches like `period` vs `Period`.

Fix anything it flags before moving on.

---

## 6. Migrate the existing content

The first successful sync **replaces** the placeholder HTML currently committed
in `projects.html`, `academics.html` and `index.html`. Before enabling the
workflow, copy the existing entries into Notion:

- **5 projects** — ModelHive, Gesture Power FX, MindCare, ASCII Art Studio,
  Resume Roaster. Their descriptions, URLs and tags are in the placeholder block
  in `projects.html`.
- **3 education entries** and **2 achievements** — in `academics.html`.

Then run it locally first and read the diff before pushing:

```bash
cp .env.example .env      # fill in the four database IDs
npm run sync:all
git diff --stat
```

If a database is empty or every row is unpublished, the generator prints a
warning and leaves the existing HTML untouched — so a mistake here fails safe.
