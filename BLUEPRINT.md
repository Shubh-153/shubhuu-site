# 📐 The Cinematic Portfolio Blueprint

This document serves as an open-source architectural guide. If you want to build a highly interactive, physics-driven, and automated portfolio like this one—without relying on heavy frameworks like React or Three.js—follow this blueprint.

---

## 🏗️ 1. Core Architecture (The "No-Framework" Approach)
The entire site is built using **Vanilla HTML, CSS, and JavaScript**. This ensures lightning-fast load times and complete control over the DOM for physics engines.

### Directory Structure
```text
/
├── index.html            # Main landing page
├── projects.html         # Projects explore page (search + tech-stack filters)
├── project.html          # Template for generated project detail pages
├── article.html          # Template for generated blog post pages
├── academics.html        # Education + achievements
├── creative.html         # The physics-driven gallery page
├── lib/
│   └── notion.js         # Shared generator helpers
├── fetch-notion.js       # Notion → blog posts
├── fetch-projects.js     # Notion → projects + detail pages
├── fetch-profile.js      # Notion → academics + achievements
├── fetch-bento.js        # Cloudinary → creative gallery
├── build-sitemap.js      # manifests → sitemap.xml
├── .github/
│   └── workflows/
│       ├── notion-sync.yml     # Hourly Notion content sync
│       └── cloudinary-sync.yml # Hourly gallery sync
└── README.md
```

---

## ⚙️ 2. The Headless "Zero-Maintenance" CMS
Instead of a traditional CMS or database, we use **Notion + Cloudinary + GitHub Actions**. The pattern is the same for every content type, so adding a new one is mechanical.

### The pattern: marker injection
1. **Put a marker pair in the HTML** where generated content belongs:
   ```html
   <!-- PROJECT_CARDS_START -->
   <!-- PROJECT_CARDS_END -->
   ```
2. **Write a generator** that fetches rows, builds an HTML string, and replaces everything between the markers. Use `injectMarker()` from `lib/notion.js` — it throws if the marker is missing (so a typo fails loudly instead of silently producing nothing) and injects the replacement through a function callback so `$&` / `` $` `` inside content are never treated as replacement patterns.
3. **Add a step** to `.github/workflows/notion-sync.yml`. Keep steps sequential if two generators write the same file.

### How to replicate
1. **Notion setup:** create a database, share it with your integration (an unshared database returns 404), and add its ID as a repo secret.
2. **Read properties by name, not by type.** It's tempting to grab "the first date property", but that breaks the moment a schema has two URL fields. `readProps(page)` in `lib/notion.js` does named lookup and returns a neutral empty value when a property is missing or the wrong type, so a rename in Notion degrades one field instead of crashing the hourly job.
3. **Always guard against empty results.** `assertNotEmpty()` makes a generator refuse to write when its query returns zero rows. Without it, one API hiccup blanks a page and the auto-commit action pushes it.
4. **Track what you generated.** Slugs derive from titles, so renaming a row orphans its old page. Keep a manifest and prune only slugs you previously owned.
5. **Escape everything.** All interpolated values go through `escapeHtml()` — Notion content is user input as far as the generator is concerned.

**Result:** Write in Notion or upload to Cloudinary from your phone, and the site updates and redeploys itself within an hour.

---

## 🎨 3. The Visual Engine (Bento Grid & Glassmorphism)
- **Bento Grid:** Use CSS Grid (`display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); grid-auto-rows: 250px;`). Vary the `grid-column: span 2` and `grid-row: span 2` on specific items to create the asymmetrical "Bento Box" look.
- **Glassmorphism:** For the cards, use a translucent background with CSS `backdrop-filter: blur(10px)` to let the background canvas shine through.

---

## 🌌 4. The Background System (WebGL Particle Galaxy)
To create the deep space effect:
1. Place a `<canvas id="galaxy"></canvas>` in the background with `position: fixed; z-index: -1;`.
2. In JS, instantiate hundreds of particle objects with `x`, `y`, `z`, and `velocity` properties.
3. Use a `requestAnimationFrame` loop to continuously move the particles. When a particle's `z` value gets too close, reset it to the far distance to create the illusion of flying through space.

---

## 💥 5. The Interaction Engine (Magnetic UI & Physics)
### Magnetic Buttons
- Add `mousemove` event listeners to buttons. Calculate the distance from the mouse to the center of the button.
- If the mouse is close, apply a `transform: translate(x, y)` to pull the button towards the cursor. On `mouseleave`, reset the transform with a spring transition.

### The "Supernova" Physics Engine
1. **The Charge Up:** Listen for `mousedown` / `touchstart` anywhere on the page (excluding gallery cards). On hold, increase a `chargeTime` variable in your animation loop. Apply CSS `filter: blur()` and CSS `transform: scale()` to the screen to simulate gravity bending.
2. **The Explosion:** If `chargeTime` exceeds a threshold, trigger the explosion. 
3. **Collision Physics:** Loop through every DOM element (using `getBoundingClientRect`). Calculate the vector from the explosion epicenter to the element's center. Apply an instantaneous velocity vector to the element and use `transform: translate()` in a rapid animation loop to blast them off-screen.

---

## 🎵 6. The Procedural Audio Engine (Web Audio API)
Instead of loading MP3 files (which are heavy), generate sound using math:
1. Create an `AudioContext`.
2. **Hover sounds:** When hovering over a card, instantiate an `OscillatorNode`, set the frequency to a high pitch (e.g., 800Hz), and rapidly ramp the gain (volume) down to 0 over 0.1 seconds to create a "ping".
3. **Ambient Drone:** Create 2-3 oscillators at very low frequencies (50Hz - 100Hz). Run them through a `BiquadFilterNode` (lowpass) and modulate the filter frequency with an LFO (Low Frequency Oscillator) to create a breathing, sweeping deep-space drone.

---
*Follow these systems, and you can build a highly performant, visually stunning cinematic experience tailored exactly to your brand.*
