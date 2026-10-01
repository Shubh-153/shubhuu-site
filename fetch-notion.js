require('dotenv').config();
const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');

const {
  SITE, AUTHOR, OG_IMAGE, BASE_KEYWORDS,
  escapeHtml, replaceBlock, injectMarker, slugify, makeSlug, uniqueSlug,
  extractMarkdownContent, buildExcerpt, queryAllPages,
  pruneGenerated, pickRelated, assertNotEmpty,
} = require('./lib/notion');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

const MANIFEST = '.generated-posts.json';

const postUrl = slug => `${SITE}/${slug}.html`;

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

function buildRelatedBlock(current, blogs) {
  const related = pickRelated(current, blogs, b => b.categorySlugs);
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

function buildFeed(blogs) {
  // Newest post date, not "now": a timestamp that changes every run made the
  // hourly sync commit an otherwise identical feed.
  const newest = blogs.reduce((max, b) => (b.createdTime > max ? b.createdTime : max), new Date(0));
  const now = (blogs.length ? newest : new Date()).toUTCString();
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

async function buildSite() {
  const { marked } = await import('marked');

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    console.log("No NOTION_DATABASE_ID provided. Skipping blog build.");
    return;
  }

  console.log("Fetching blog database from Notion...");
  const pages = await queryAllPages(databaseId);
  console.log(`Fetched ${pages.length} page(s).`);

  const blogs = [];

  for (const page of pages) {
    const titleProperty = Object.values(page.properties).find(p => p.type === 'title');
    const title = titleProperty && titleProperty.title.length > 0 ? titleProperty.title[0].plain_text : 'Untitled';

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
    const htmlContent = marked.parse(extractMarkdownContent(mdString));

    blogs.push({
      title, id: page.id, date, isoDate: createdTime.toISOString(),
      categories, categoryLabel, categorySlugs,
      excerpt: buildExcerpt(htmlContent, title),
      htmlContent, createdTime
    });
  }

  blogs.sort((a, b) => b.createdTime - a.createdTime);

  // Slugs are assigned after sorting so a duplicate-title suffix (-2, -3) is
  // deterministic across runs rather than depending on Notion's response order.
  const usedSlugs = new Set();
  blogs.forEach(b => { b.slug = uniqueSlug(makeSlug(b.title, b.id), usedSlugs, 'blog post'); });

  // A transient API failure returning zero rows must never blank blogs.html and
  // get auto-committed by CI.
  if (!assertNotEmpty(blogs, 'published blog posts')) return;

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
  let indexHtml = fs.readFileSync('index.html', 'utf8');
  indexHtml = injectMarker(indexHtml, 'LATEST_BLOG', `    <div class="blog-grid">
${blogs.slice(0, 3).map(b => blogCard(b)).join('\n')}
    </div>`, '    ');
  fs.writeFileSync('index.html', indexHtml);

  // 4. RSS feed (blog-only by design; sitemap.xml is built by build-sitemap.js
  //    so it can also see the generated project pages).
  fs.writeFileSync('feed.xml', buildFeed(blogs));

  // 5. Clean up posts renamed/removed in Notion
  pruneGenerated(MANIFEST, blogs.map(b => b.slug));

  console.log(`Blogs built successfully: ${blogs.length} post(s), feed.xml.`);
}

if (require.main === module) {
  buildSite().catch(err => {
    console.error(err.isConfigError ? `\n${err.message}\n` : err);
    process.exit(1);
  });
}

module.exports = { buildSite, buildSeoBlock, buildFeed, blogCard };
