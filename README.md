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
To make updating the site completely effortless, I built a custom automated headless CMS using Cloudinary and GitHub Actions.

**How it works:**
1. **Cloudinary as the Database:** Whenever I take a new photo, I simply upload it to a specific folder on my Cloudinary account from my phone.
2. **Automated Node Scripts:** Custom Node.js scripts (`fetch-bento.js`, `fetch-images.js`) run via GitHub Actions.
3. **Hourly Sync (Cron Jobs):** Every hour, a GitHub Action workflow triggers. It connects to the Cloudinary API, fetches the latest images in the folder, and automatically injects the new HTML directly into the source code of the website.
4. **Auto-Deploy:** The workflow automatically commits the updated HTML back to the `main` branch, instantly deploying the new images to the live site. 
**Result:** I can update my live website from anywhere in the world just by uploading an image to Cloudinary, without ever touching the code!

## 📱 Mobile & Performance Optimization
- Deep optimizations for mobile devices, including preventing accidental supernova triggers during normal scrolling.
- Reduced motion detection via `@media (prefers-reduced-motion)`.
- Smart loading (`loading="lazy"`, `decoding="async"`) to ensure smooth performance despite hundreds of high-res images.

## 📁 Key Files
- `index.html`: The main landing page showcasing standard projects and information.
- `creative.html` / `creative-bento.html`: The highly experimental, physics-driven cinematic photo gallery.
- `.github/workflows/`: Contains the YAML cron jobs for the automated CMS.
- `fetch-*.js`: The Node scripts responsible for interacting with the Cloudinary Admin API and parsing HTML.

---
*Built with passion, caffeine, and Vanilla JS.*
