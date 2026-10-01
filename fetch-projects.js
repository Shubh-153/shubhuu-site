require('dotenv').config();
const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');

const {
  SITE, AUTHOR, OG_IMAGE, BASE_KEYWORDS,
  escapeHtml, replaceBlock, injectMarker, slugify, makeSlug, uniqueSlug, extractMarkdownContent,
  buildExcerpt, queryAllPages, readProps, optimizeCloudinary,
  pruneGenerated, pickRelated, assertNotEmpty, formatDate,
} = require('./lib/notion');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

const MANIFEST = '.generated-projects.json';
const TEMPLATE = 'project.html';

// `project-` prefixes every generated filename so a project and a blog post that
// happen to share a title can never overwrite each other.
const projectFile = slug => `project-${slug}.html`;
const projectUrl = slug => `${SITE}/${projectFile(slug)}`;

// Gallery is a free-text field: accept newline-, comma- or space-separated URLs.
function parseUrlList(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(s => /^https?:\/\//.test(s));
}

function buildSeoBlock(p) {
  const fullTitle = `${p.title} | ${AUTHOR}`;
  const url = projectUrl(p.slug);
  const image = p.cover || OG_IMAGE;
  const keywords = p.stack.length
    ? `${p.stack.join(', ')}, ${BASE_KEYWORDS}`
    : BASE_KEYWORDS;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: p.title,
    description: p.description,
    applicationCategory: 'WebApplication',
    operatingSystem: 'Any',
    image,
    url: p.liveUrl || url,
    author: { '@type': 'Person', name: AUTHOR, url: `${SITE}/` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (p.stack.length) jsonLd.keywords = p.stack.join(', ');
  if (p.isoDate) jsonLd.datePublished = p.isoDate;
  if (p.repoUrl) jsonLd.codeRepository = p.repoUrl;

  return `<!-- SEO_META_START -->
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(p.description)}">
<meta name="keywords" content="${escapeHtml(keywords)}">
<meta name="author" content="${escapeHtml(AUTHOR)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(AUTHOR)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(p.description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(p.description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).replace(/<\//g, '<\\/')}
</script>
<!-- SEO_META_END -->`;
}

function buildHero(p) {
  const meta = [];
  if (p.year) meta.push(`      <span>${escapeHtml(p.year)}</span>`);
  if (p.status) meta.push(`      <span class="project-status" data-status="${escapeHtml(p.statusSlug)}">${escapeHtml(p.status)}</span>`);

  const cover = p.cover ? `
    <figure class="project-cover">
      <img src="${escapeHtml(p.cover)}" alt="Screenshot of ${escapeHtml(p.title)}" loading="eager" decoding="async">
    </figure>` : '';

  const stack = p.stack.length ? `
    <div class="stack-block">
      <div class="stack-label">Tech Stack</div>
      <div class="stack-list">
${p.stack.map(t => `        <span class="stack-chip">${escapeHtml(t)}</span>`).join('\n')}
      </div>
    </div>` : '';

  return `  <header class="project-header">
${meta.length ? `    <div class="project-hero-meta">\n${meta.join('\n')}\n    </div>\n` : ''}    <h1 class="project-hero-title">${escapeHtml(p.title)}</h1>
${p.tagline ? `    <p class="project-tagline">${escapeHtml(p.tagline)}</p>\n` : ''}${cover}${stack}
  </header>`;
}

function buildCta(p, { foot = false, bare = false } = {}) {
  const buttons = [];
  if (p.liveUrl) {
    buttons.push(`    <a class="btn primary" href="${escapeHtml(p.liveUrl)}" target="_blank" rel="noopener noreferrer">Visit Live Site &#8599;</a>`);
  }
  if (p.repoUrl) {
    buttons.push(`    <a class="btn ghost" href="${escapeHtml(p.repoUrl)}" target="_blank" rel="noopener noreferrer">View Source &#8599;</a>`);
  }
  if (!buttons.length) return '';
  const cls = ['project-cta', foot && 'project-cta-foot', bare && 'project-cta-bare'].filter(Boolean).join(' ');
  return `  <div class="${cls}">
${buttons.join('\n')}
  </div>`;
}

function buildGallery(p) {
  if (!p.gallery.length) return '';
  return `  <section class="project-gallery">
    <h2>Screenshots</h2>
    <div class="project-gallery-grid">
${p.gallery.map((src, i) => `      <figure>
        <img src="${escapeHtml(src)}" alt="${escapeHtml(p.title)} screenshot ${i + 1}" loading="lazy" decoding="async">
      </figure>`).join('\n')}
    </div>
  </section>`;
}

// Card thumbnails: a 16:10 crop anchored at the top, where screenshots keep
// their nav and hero. Cloudinary does the resize so cards stay light.
function thumbUrl(url) {
  if (!url) return null;
  if (!/res\.cloudinary\.com\//.test(url) || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_800,h_500,c_fill,g_north/');
}

// Stable hue per project so a placeholder keeps its colour across builds.
function hueFor(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function projectThumb(p, cls = 'project-thumb') {
  if (p.thumb) {
    return `<div class="${cls}"><img src="${escapeHtml(p.thumb)}" alt="" loading="lazy" decoding="async"></div>`;
  }
  const letter = escapeHtml([...p.title.trim()][0]?.toUpperCase() || '?');
  return `<div class="${cls} ${cls}-ph" style="--h:${hueFor(p.slug)}" aria-hidden="true"><span>${letter}</span></div>`;
}

function projectCard(p, extraClass = '') {
  const stack = p.stackSlugs.length ? p.stackSlugs.join(' ') : 'untagged';
  const tags = p.stack.slice(0, 5)
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const status = p.status
    ? `\n          <span class="project-status" data-status="${escapeHtml(p.statusSlug)}">${escapeHtml(p.status)}</span>`
    : '';
  return `      <a href="/${projectFile(p.slug)}" class="project${extraClass}" data-stack="${escapeHtml(stack)}" data-status="${escapeHtml(p.statusSlug || 'none')}" data-search="${escapeHtml(p.searchText)}">
        ${projectThumb(p)}
        <div class="project-top">
          <div class="project-title">${escapeHtml(p.title)}</div>${status}
        </div>
        <p class="project-desc">${escapeHtml(p.description)}</p>
        <div class="tags">${tags}</div>
        <div class="project-action"><span>View Project &#8594;</span></div>
      </a>`;
}

function buildRelated(current, projects) {
  const related = pickRelated(current, projects, p => p.stackSlugs);
  if (!related.length) return '';
  return `  <section class="related-projects">
    <h2>More projects</h2>
    <div class="related-grid">
${related.map(p => `      <a href="/${projectFile(p.slug)}" class="project-card">
        ${projectThumb(p, 'project-card-thumb')}
        <div class="project-card-title">${escapeHtml(p.title)}</div>
        <p class="project-card-desc">${escapeHtml(p.description)}</p>
        <span class="project-card-more">View Project &#8594;</span>
      </a>`).join('\n')}
    </div>
  </section>`;
}

function buildFilters(projects) {
  const counts = new Map();
  projects.forEach(p => p.stack.forEach((name, i) => {
    const key = p.stackSlugs[i];
    const entry = counts.get(key) || { name, n: 0 };
    entry.n += 1;
    counts.set(key, entry);
  }));

  const search = `      <div class="project-search">
        <label class="visually-hidden" for="project-search">Search projects</label>
        <input type="search" id="project-search" placeholder="Search projects..." autocomplete="off" spellcheck="false">
      </div>`;

  // Nothing worth filtering by until there are at least two distinct tags.
  if (counts.size < 2) {
    return `    <div class="project-controls">
${search}
    </div>`;
  }

  const chips = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));

  return `    <div class="project-controls">
${search}
      <div class="blog-filters" role="group" aria-label="Filter projects by tech stack">
        <button type="button" class="filter-chip" data-filter="all" aria-pressed="true">All (${projects.length})</button>
${chips.map(([slug, c]) => `        <button type="button" class="filter-chip" data-filter="${escapeHtml(slug)}" aria-pressed="false">${escapeHtml(c.name)} (${c.n})</button>`).join('\n')}
      </div>`
    + `\n      <p class="project-count" role="status" aria-live="polite"></p>\n    </div>`;
}

async function buildProjects() {
  const { marked } = await import('marked');

  const databaseId = process.env.NOTION_PROJECTS_DB_ID;
  if (!databaseId) {
    console.log('No NOTION_PROJECTS_DB_ID provided. Skipping projects build.');
    return;
  }

  console.log('Fetching projects database from Notion...');
  const pages = await queryAllPages(databaseId);
  console.log(`Fetched ${pages.length} row(s).`);

  const projects = [];

  for (const page of pages) {
    const p = readProps(page);
    // Treat a missing `Published` column as "everything is published", so the
    // draft gate is opt-in rather than a silent way to render nothing.
    if (p.hasProp('Published') && !p.check('Published')) continue;

    const title = p.title() || 'Untitled';

    const tagline = p.text('Tagline');
    const stack = p.multi('Tech Stack');
    const status = p.select('Status');
    const dateStr = p.date('Year') || page.created_time;
    const createdTime = new Date(dateStr);

    const mdblocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdblocks);
    const htmlContent = marked.parse(extractMarkdownContent(mdString));

    // Tagline is the intended summary; fall back to the body so a project with
    // no tagline still gets a usable card and meta description.
    const description = tagline || buildExcerpt(htmlContent, title);

    projects.push({
      title, id: page.id, tagline, description, stack,
      stackSlugs: stack.map(slugify),
      status,
      statusSlug: status ? slugify(status) : '',
      liveUrl: p.url('Live URL'),
      repoUrl: p.url('Repo URL'),
      cover: optimizeCloudinary(p.url('Cover')),
      thumb: thumbUrl(p.url('Cover')),
      gallery: parseUrlList(p.text('Gallery')).map(u => optimizeCloudinary(u)),
      year: p.date('Year') ? String(new Date(p.date('Year')).getFullYear()) : '',
      isoDate: isNaN(createdTime) ? null : createdTime.toISOString(),
      featured: p.check('Featured'),
      createdTime,
      htmlContent,
      searchText: [title, tagline, status, ...stack].filter(Boolean).join(' ').toLowerCase(),
    });
  }

  projects.sort((a, b) => (b.createdTime - a.createdTime) || a.title.localeCompare(b.title));

  // Assigned after sorting so a duplicate-title suffix (-2, -3) is deterministic
  // across runs rather than depending on Notion's response order.
  const usedSlugs = new Set();
  projects.forEach(p => { p.slug = uniqueSlug(makeSlug(p.title, p.id), usedSlugs, 'project'); });

  // A transient API failure returning zero rows must never blank projects.html
  // and get auto-committed by CI.
  if (!assertNotEmpty(projects, 'published projects')) return;

  // 1. One detail page per project
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  projects.forEach(p => {
    let html = template;
    // buildSeoBlock emits its own markers, so swap the whole block wholesale.
    html = replaceBlock(html, /<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/, buildSeoBlock(p));
    html = injectMarker(html, 'PROJECT_HERO', buildHero(p));
    // With no body or gallery, the top CTA's divider and the footer CTA would
    // both sit on empty space — a stray rule and a duplicate button.
    const hasBody = p.htmlContent.trim() !== '' || buildGallery(p) !== '';
    html = injectMarker(html, 'PROJECT_CTA', buildCta(p, { bare: !hasBody }));
    html = injectMarker(html, 'PROJECT_CONTENT', p.htmlContent, '    ');
    html = injectMarker(html, 'PROJECT_GALLERY', buildGallery(p));
    html = injectMarker(html, 'PROJECT_CTA_FOOT', hasBody ? buildCta(p, { foot: true }) : '');
    html = injectMarker(html, 'RELATED_PROJECTS', buildRelated(p, projects));
    fs.writeFileSync(projectFile(p.slug), html);
  });

  // 2. projects.html explore page — search + filters + cards
  let projectsHtml = fs.readFileSync('projects.html', 'utf8');
  projectsHtml = injectMarker(projectsHtml, 'PROJECT_FILTERS', buildFilters(projects), '    ');
  projectsHtml = injectMarker(
    projectsHtml,
    'PROJECT_CARDS',
    projects.map(p => projectCard(p, p.featured ? ' bento-wide' : '')).join('\n\n'),
    '      '
  );
  fs.writeFileSync('projects.html', projectsHtml);

  // 3. index.html featured strip — Featured projects lead, then the newest
  //    remaining ones top the strip up to three, so the homepage is never
  //    sparse just because only one row was ticked.
  const strip = [
    ...projects.filter(p => p.featured),
    ...projects.filter(p => !p.featured),
  ].slice(0, 3);
  let indexHtml = fs.readFileSync('index.html', 'utf8');
  indexHtml = injectMarker(
    indexHtml,
    'FEATURED_PROJECTS',
    // Bento: the lead card spans both columns, the other two sit side by side below it
    `    <div class="projects">\n${strip.map((p, i) => projectCard(p, i === 0 ? ' bento-wide' : '')).join('\n\n')}\n    </div>`,
    '    '
  );
  fs.writeFileSync('index.html', indexHtml);

  // 4. Clean up projects renamed/removed in Notion
  pruneGenerated(MANIFEST, projects.map(p => p.slug), projectFile);

  const featuredCount = projects.filter(p => p.featured).length;
  console.log(`Projects built successfully: ${projects.length} project(s), ${featuredCount} marked featured, ${strip.length} on the homepage.`);
}

if (require.main === module) {
  buildProjects().catch(err => {
    console.error(err.isConfigError ? `\n${err.message}\n` : err);
    process.exit(1);
  });
}

module.exports = { buildProjects, projectCard, buildFilters, buildSeoBlock, buildHero, buildCta, buildGallery, buildRelated, parseUrlList };
