# Shubh Gupta - Interactive Portfolio

Welcome to the repository for my personal portfolio! Over the past 5 days, this project has evolved from a standard website into a highly interactive, dynamic, and automated showcase of my work. The goal was to build a space that feels alive, cinematic, and technically impressive—without relying on heavy frontend frameworks.

## 🚀 Tech Stack Overview
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Graphics & Physics:** HTML5 `<canvas>`, WebGL (for particle physics and galaxy simulations)
- **Audio:** Web Audio API (for real-time synthesized sound effects and ambient drones)
- **Backend / Automation:** Node.js, GitHub Actions
- **Headless CMS & Hosting:** Cloudinary API, Vercel / GitHub Pages
- **Analytics:** PostHog

## ✨ Features, Animations & Effects
This portfolio heavily prioritizes micro-interactions, fluid animations, and a cinematic feel:
- **Magnetic UI:** Buttons and links utilize a custom physics script to magnetically pull towards the user's cursor.
- **Custom Hardware-Accelerated Cursor:** A custom rocket/camera cursor that adapts based on the active screen and disables itself gracefully on touch devices.
- **Interactive WebGL Galaxy:** A dynamic, physics-based particle system rendering a deep space galaxy in the background. It responds to window resizing and creates a parallax depth effect.
- **"Supernova" Physics Engine:** By holding down the mouse/touch, users can charge up a black hole that eventually explodes into a supernova, violently blasting the image grid apart using custom 2D collision physics.
- **Procedural Web Audio Engine:** Instead of loading heavy MP3s, sound effects (hover pings, charging hums, supernova blasts, and ambient drones) are generated entirely via math and oscillators using the Web Audio API.
- **Glassmorphism & Bento Grids:** The UI uses heavily styled bento-box layouts, frosted glass (backdrop-filter), and tilt-cards to display photography and projects.

## ⚙️ The "Zero-Maintenance" CMS System
To make updating the site completely effortless, I built a custom automated headless CMS using **Notion**, **Cloudinary** and **GitHub Actions**. There is no database and no build step — the generators write plain HTML straight into the committed pages.

**The content types:**

| Content | Source | Generator | Writes |
| --- | --- | --- | --- |
| Blog posts | Notion (`NOTION_DATABASE_ID`) | `fetch-notion.js` | `blogs.html`, `<slug>.html`, `feed.xml` |
| Projects | Notion (`NOTION_PROJECTS_DB_ID`) | `fetch-projects.js` | `projects.html`, `project-<slug>.html`, homepage strip |
| Academics | Notion (`NOTION_ACADEMICS_DB_ID`) | `fetch-profile.js` | `academics.html`, homepage strip |
| Achievements | Notion (`NOTION_ACHIEVEMENTS_DB_ID`) | `fetch-profile.js` | `academics.html` |
| Photography | Cloudinary (`shubhuu-creative`) | `fetch-bento.js` | `creative.html` |
| Sitemap | the manifests above | `build-sitemap.js` | `sitemap.xml` |

**How it works:**
1. **Notion & Cloudinary as the database:** I write a blog post or add a project row in Notion; photos go into a Cloudinary folder. No CMS admin panel to maintain.
2. **Marker injection:** Each generator finds a pair of HTML comments (e.g. `<!-- PROJECT_CARDS_START -->` … `<!-- PROJECT_CARDS_END -->`) and replaces everything between them. Nothing else in the page is touched, so hand-written markup and generated markup live side by side.
3. **Hourly sync (cron):** `.github/workflows/notion-sync.yml` runs every hour, executes each generator in order, then commits the changed HTML back to `main`.
4. **Auto-deploy:** GitHub Pages serves the committed HTML, so the site is live within the hour.

**Safety properties worth knowing if you fork this:**
- Every generator **refuses to write when its database returns zero rows**, so a transient API failure can never blank a page and get auto-committed.
- Renaming a row in Notion changes its slug. Each generator keeps a manifest (`.generated-posts.json`, `.generated-projects.json`) and deletes only pages it previously generated — hand-written pages can never be caught by the prune.
- A `Published` checkbox acts as a draft gate. If the column doesn't exist, everything is treated as published.

**Setting it up:** see [`NOTION-SETUP.md`](NOTION-SETUP.md) for the exact Notion property names each database needs, plus the repo secrets to add.

**Running it locally:** put the keys in a `.env`, then `npm run sync:all` (or `sync:blogs` / `sync:projects` / `sync:profile` / `sync:sitemap` / `sync:creative` individually).

## 📱 Mobile & Performance Optimization
- Deep optimizations for mobile devices, including preventing accidental supernova triggers during normal scrolling.
- Reduced motion detection via `@media (prefers-reduced-motion)`.
- Smart loading (`loading="lazy"`, `decoding="async"`) to ensure smooth performance despite hundreds of high-res images.

## 📁 Key Files
- `index.html`: The main landing page showcasing standard projects and information.
- `projects.html`: The projects explore page — search + tech-stack filtering over every project.
- `project.html`: The `noindex` template every `project-<slug>.html` detail page is rendered from.
- `article.html`: The equivalent template for blog posts.
- `academics.html`: Education and achievements.
- `creative.html` / `creative-bento.html`: The highly experimental, physics-driven cinematic photo gallery.
- `lib/notion.js`: Shared helpers for every generator (escaping, marker injection, Notion property access, pruning).
- `fetch-*.js` / `build-sitemap.js`: The Node generators. See the CMS table above for what each one writes.
- `.github/workflows/`: The YAML cron jobs for the automated CMS.

---
*Built with passion, caffeine, and Vanilla JS.*
