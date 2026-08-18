require('dotenv').config();
const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

const SITE = 'https://shubhuu.in';
const AUTHOR = 'Shubh Gupta';
const OG_IMAGE = `${SITE}/thumbnail.png`;
const MANIFEST = '.generated-posts.json';

const BASE_KEYWORDS = 'Shubh Gupta, software development, ai software development, software development engineer, ai software developer, software engineering, application developer, app software developer, software development india, find a software developer, full stack, app developer, ai developer, software developer india, find developer, web app developer, it software developer, software developer skills, build software, dev ops';

// Static pages that belong in the sitemap. Demo/orphan pages (article*.html,
// creative-bento.html, creative-masonry.html) are deliberately excluded.
const STATIC_PAGES = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/blogs.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/projects.html`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/creative.html`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/academics.html`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITE}/links.html`, changefreq: 'monthly', priority: '0.6' },
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Replacement values are injected verbatim: use a function so that `$&`, `$'`
// and friends inside post content are never interpreted as replacement patterns.
function replaceBlock(haystack, regex, replacement) {
  return haystack.replace(regex, () => replacement);
}

const postUrl = slug => `${SITE}/${slug}.html`;
const slugify = str => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

function buildExcerpt(htmlContent, title, limit = 155) {
  let text = decodeEntities(String(htmlContent).replace(/<[^>]+>/g, ' '));
  // Notion bodies usually repeat the title as the first heading — drop it so the
  // meta description does not start by restating the <title>.
  const titlePattern = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp('^\\s*' + titlePattern + '\\s*', 'i'), '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '') + '...';
}

async function queryAllPages(databaseId) {
  const results = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
    });
    if (!res.ok) throw new Error(`Failed to fetch database: ${res.status} ${res.statusText}`);
    const page = await res.json();
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

function buildSeoBlock(blog) {
  const fullTitle = `${blog.title} | ${AUTHOR}`;
  const url = postUrl(blog.slug);
  const keywords = blog.categories.length
    ? `${blog.categories.join(', ')}, ${BASE_KEYWORDS}`
    : BASE_KEYWORDS;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: blog.title,
    description: blog.excerpt,
    image: OG_IMAGE,
    datePublished: blog.isoDate,
    dateModified: blog.isoDate,
    author: { '@type': 'Person', name: AUTHOR, url: `${SITE}/` },
    publisher: { '@type': 'Person', name: AUTHOR, url: `${SITE}/` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (blog.categories.length) jsonLd.articleSection = blog.categories;

  return `<!-- SEO_META_START -->
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(blog.excerpt)}">
<meta name="keywords" content="${escapeHtml(keywords)}">
<meta name="author" content="${escapeHtml(AUTHOR)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(AUTHOR)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(blog.excerpt)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:url" content="${url}">
<meta property="article:published_time" content="${blog.isoDate}">
<meta property="article:author" content="${escapeHtml(AUTHOR)}">
${blog.categories.map(c => `<meta property="article:section" content="${escapeHtml(c)}">`).join('\n')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(blog.excerpt)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(AUTHOR)} — Blog" href="/feed.xml">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).replace(/<\//g, '<\\/')}
</script>
<!-- SEO_META_END -->`;
}

function blogCard(blog, extraClass = '') {
  const cats = blog.categorySlugs.length ? blog.categorySlugs.join(' ') : 'uncategorized';
  return `      <a href="/${blog.slug}.html" class="blog-card${extraClass}" data-category="${escapeHtml(cats)}">
        <div class="blog-meta">${escapeHtml(blog.date)} • ${escapeHtml(blog.categoryLabel)}</div>
        <h3 class="blog-title">${escapeHtml(blog.title)}</h3>
        <p class="blog-excerpt">${escapeHtml(blog.excerpt)}</p>
        <span class="blog-readmore">Read Article ➔</span>
      </a>`;
}

// Prefer posts sharing categories (most overlap first), then fall back to the
// newest remaining posts. `blogs` is already sorted newest-first.
function pickRelated(current, blogs, limit = 3) {
  const others = blogs.filter(b => b.slug !== current.slug);
  const shared = b => b.categorySlugs.filter(c => current.categorySlugs.includes(c)).length;
  return others
    .map((b, i) => ({ b, score: shared(b), i }))
    .sort((x, y) => (y.score - x.score) || (x.i - y.i))
    .slice(0, limit)
    .map(x => x.b);
}

function buildRelatedBlock(current, blogs) {
  const related = pickRelated(current, blogs);
  if (!related.length) return '<!-- RELATED_POSTS_START -->\n  <!-- RELATED_POSTS_END -->';
  return `<!-- RELATED_POSTS_START -->
  <section class="related">
    <h2>Read more</h2>
    <div class="related-grid">
${related.map(b => blogCard(b)).join('\n')}
    </div>
  </section>
  <!-- RELATED_POSTS_END -->`;
}

function buildFiltersBlock(blogs) {
  const counts = new Map();
  blogs.forEach(b => b.categories.forEach((c, i) => {
    const key = b.categorySlugs[i];
    const entry = counts.get(key) || { name: c, n: 0 };
    entry.n += 1;
    counts.set(key, entry);
  }));
  // Nothing to filter by until the Notion database actually has >1 category.
  if (counts.size < 2) return '<!-- BLOG_FILTERS_START -->\n    <!-- BLOG_FILTERS_END -->';

  const chips = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
  return `<!-- BLOG_FILTERS_START -->
    <div class="blog-filters" role="group" aria-label="Filter articles by category">
      <button type="button" class="filter-chip" data-filter="all" aria-pressed="true">All (${blogs.length})</button>
${chips.map(([slug, c]) => `      <button type="button" class="filter-chip" data-filter="${escapeHtml(slug)}" aria-pressed="false">${escapeHtml(c.name)} (${c.n})</button>`).join('\n')}
    </div>
    <!-- BLOG_FILTERS_END -->`;
}

function buildSitemap(blogs) {
  const now = new Date().toISOString();
  const urls = [
    ...STATIC_PAGES.map(p => ({ ...p, lastmod: now })),
    ...blogs.map(b => ({ loc: postUrl(b.slug), changefreq: 'monthly', priority: '0.7', lastmod: b.isoDate })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by fetch-notion.js. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function buildFeed(blogs) {
  const now = new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(AUTHOR)} — Blog</title>
    <link>${SITE}/blogs.html</link>
    <description>Writing on software development, AI and building things on the web.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${blogs.map(b => `    <item>
      <title>${escapeHtml(b.title)}</title>
      <link>${postUrl(b.slug)}</link>
      <guid isPermaLink="true">${postUrl(b.slug)}</guid>
      <pubDate>${b.createdTime.toUTCString()}</pubDate>
      <description>${escapeHtml(b.excerpt)}</description>
${b.categories.map(c => `      <category>${escapeHtml(c)}</category>`).join('\n')}
    </item>`).join('\n')}
  </channel>
</rss>
`;
}

// Delete pages this script generated on a previous run but no longer owns (i.e.
// a post was renamed or removed in Notion). Only ever touches slugs recorded in
// our own manifest, so hand-written pages can never be caught by it.
function pruneRenamedPosts(currentSlugs) {
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).slugs || [];
  } catch (e) { /* first run, or manifest missing */ }

  previous
    .filter(slug => !currentSlugs.includes(slug))
    .forEach(slug => {
      const file = `${slug}.html`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Removed stale post: ${file}`);
      }
    });

  fs.writeFileSync(MANIFEST, JSON.stringify({ slugs: currentSlugs }, null, 2) + '\n');
}

async function buildSite() {
  const { marked } = await import('marked');

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    console.log("No NOTION_DATABASE_ID provided. Skipping build.");
    return;
  }

  console.log("Fetching database from Notion...");
  const pages = await queryAllPages(databaseId);
  console.log(`Fetched ${pages.length} page(s).`);

  const blogs = [];

  for (const page of pages) {
    const titleProperty = Object.values(page.properties).find(p => p.type === 'title');
    const title = titleProperty && titleProperty.title.length > 0 ? titleProperty.title[0].plain_text : 'Untitled';
    const slug = slugify(title);

    const dateProperty = Object.values(page.properties).find(p => p.type === 'date');
    let dateStr = page.created_time;
    if (dateProperty && dateProperty.date) dateStr = dateProperty.date.start;
    const createdTime = new Date(dateStr);
    const date = createdTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const selectProperty = Object.values(page.properties).find(p => p.type === 'select');
    const multiSelectProperty = Object.values(page.properties).find(p => p.type === 'multi_select');
    let categories = [];
    if (multiSelectProperty && multiSelectProperty.multi_select.length > 0) {
      categories = multiSelectProperty.multi_select.map(s => s.name);
    } else if (selectProperty && selectProperty.select) {
      categories = [selectProperty.select.name];
    }
    const categoryLabel = categories.length ? categories.join(', ') : 'Blog';
    const categorySlugs = categories.map(slugify);

    const mdblocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdblocks);
    const htmlContent = marked.parse(mdString.parent || mdString);

    blogs.push({
      title, slug, date, isoDate: createdTime.toISOString(),
      categories, categoryLabel, categorySlugs,
      excerpt: buildExcerpt(htmlContent, title),
      htmlContent, createdTime
    });
  }

  blogs.sort((a, b) => b.createdTime - a.createdTime);

  // 1. Generate individual article HTML pages
  const articleTemplate = fs.readFileSync('article.html', 'utf8');
  blogs.forEach(blog => {
    let articleHtml = articleTemplate;
    articleHtml = replaceBlock(articleHtml, /<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/, buildSeoBlock(blog));
    articleHtml = replaceBlock(articleHtml, /<h1 class="article-title">[\s\S]*?<\/h1>/, `<h1 class="article-title">${escapeHtml(blog.title)}</h1>`);
    articleHtml = replaceBlock(articleHtml, /<div class="article-meta">[\s\S]*?<\/div>/, `<div class="article-meta">${escapeHtml(blog.date)} • ${escapeHtml(blog.categoryLabel)}</div>`);
    articleHtml = replaceBlock(articleHtml, /<!-- ARTICLE_CONTENT_START -->[\s\S]*?<!-- ARTICLE_CONTENT_END -->/, `<!-- ARTICLE_CONTENT_START -->\n${blog.htmlContent}\n    <!-- ARTICLE_CONTENT_END -->`);
    articleHtml = replaceBlock(articleHtml, /<!-- RELATED_POSTS_START -->[\s\S]*?<!-- RELATED_POSTS_END -->/, buildRelatedBlock(blog, blogs));

    fs.writeFileSync(`${blog.slug}.html`, articleHtml);
  });

  // 2. Update blogs.html list + category filters
  let blogsHtml = fs.readFileSync('blogs.html', 'utf8');
  const cardsHtml = blogs.map(b => '\n' + blogCard(b)).join('\n');
  blogsHtml = replaceBlock(blogsHtml, /<!-- BLOG_CARDS_START -->[\s\S]*?<!-- BLOG_CARDS_END -->/, `<!-- BLOG_CARDS_START -->\n${cardsHtml}\n      <!-- BLOG_CARDS_END -->`);
  blogsHtml = replaceBlock(blogsHtml, /<!-- BLOG_FILTERS_START -->[\s\S]*?<!-- BLOG_FILTERS_END -->/, buildFiltersBlock(blogs));
  fs.writeFileSync('blogs.html', blogsHtml);

  // 3. Update index.html latest articles
  if (blogs.length > 0) {
    let indexHtml = fs.readFileSync('index.html', 'utf8');
    const latestHtml = `<!-- LATEST_BLOG_START -->
    <div class="blog-grid">
${blogs.slice(0, 3).map(b => blogCard(b)).join('\n')}
    </div>
    <!-- LATEST_BLOG_END -->`;
    indexHtml = replaceBlock(indexHtml, /<!-- LATEST_BLOG_START -->[\s\S]*?<!-- LATEST_BLOG_END -->/, latestHtml);
    fs.writeFileSync('index.html', indexHtml);
  }

  // 4. SEO artifacts
  fs.writeFileSync('sitemap.xml', buildSitemap(blogs));
  fs.writeFileSync('feed.xml', buildFeed(blogs));

  // 5. Clean up posts renamed/removed in Notion
  pruneRenamedPosts(blogs.map(b => b.slug));

  console.log(`Site built successfully: ${blogs.length} post(s), sitemap.xml, feed.xml.`);
}

if (require.main === module) {
  buildSite().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildSite, buildSeoBlock, buildExcerpt, buildSitemap, buildFeed, blogCard, slugify, escapeHtml };
