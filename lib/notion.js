// Shared helpers for the Notion/Cloudinary content generators.
//
// Every sync script (fetch-notion.js, fetch-projects.js, fetch-profile.js,
// build-sitemap.js) injects generated HTML between comment markers in the
// committed .html files. These are the primitives they all need.

const fs = require('fs');

const SITE = 'https://shubhuu.in';
const AUTHOR = 'Shubh Gupta';
const OG_IMAGE = `${SITE}/thumbnail.png`;

const BASE_KEYWORDS = 'Shubh Gupta, software development, ai software development, software development engineer, ai software developer, software engineering, application developer, app software developer, software development india, find a software developer, full stack, app developer, ai developer, software developer india, find developer, web app developer, it software developer, software developer skills, build software, dev ops';

// Static pages that belong in the sitemap. Demo/orphan pages (article*.html,
// project.html, creative-bento.html, creative-masonry.html) are deliberately
// excluded.
const STATIC_PAGES = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/blogs.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/projects.html`, changefreq: 'weekly', priority: '0.8' },
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
// and friends inside page content are never interpreted as replacement patterns.
function replaceBlock(haystack, regex, replacement) {
  return haystack.replace(regex, () => replacement);
}

// Build the marker regex + wrapped replacement in one place so a typo in one
// generator can't silently produce a block no other script can find again.
function injectMarker(haystack, name, innerHtml, indent = '  ') {
  const start = `<!-- ${name}_START -->`;
  const end = `<!-- ${name}_END -->`;
  const re = new RegExp(`<!-- ${name}_START -->[\\s\\S]*?<!-- ${name}_END -->`);
  if (!re.test(haystack)) {
    throw new Error(`Marker ${name}_START/${name}_END not found — cannot inject.`);
  }
  const body = innerHtml ? `\n${innerHtml}\n${indent}` : `\n${indent}`;
  return replaceBlock(haystack, re, `${start}${body}${end}`);
}

// Transliterate before stripping: NFKD splits "é" into "e" + a combining
// accent, so removing the combining marks leaves "cafe" rather than "caf".
const slugify = str => String(str)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

// A title made entirely of punctuation, emoji or non-Latin script slugifies to
// "" — which would write a file literally named ".html" at the site root. Fall
// back to the Notion page id so the row still publishes, at a stable URL.
function makeSlug(title, fallbackId = '') {
  const base = slugify(title);
  if (base) return base;
  const seed = String(fallbackId).replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  console.warn(`Title ${JSON.stringify(String(title))} has no slug-able characters; using a fallback URL.`);
  return seed ? `untitled-${seed}` : 'untitled';
}

// Two rows sharing a title produce the same slug, and the second write would
// silently clobber the first. Suffix instead, and say so loudly — losing a post
// to a duplicate title should never be silent.
function uniqueSlug(slug, used, label = 'entry') {
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let n = 2;
  while (used.has(`${slug}-${n}`)) n += 1;
  const out = `${slug}-${n}`;
  used.add(out);
  console.warn(`Duplicate slug "${slug}" (${label}) — publishing as "${out}". Rename one in Notion to control the URL.`);
  return out;
}

function extractMarkdownContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(extractMarkdownContent).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    if (typeof value.parent === 'string') return value.parent;
    return Object.values(value).map(extractMarkdownContent).filter(Boolean).join('\n');
  }
  return '';
}

function buildExcerpt(htmlContent, title, limit = 155) {
  let text = decodeEntities(String(htmlContent).replace(/<[^>]+>/g, ' '));
  // Notion bodies usually repeat the title as the first heading — drop it so the
  // meta description does not start by restating the <title>.
  const titlePattern = String(title).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (titlePattern) text = text.replace(new RegExp('^\\s*' + titlePattern + '\\s*', 'i'), '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '') + '...';
}

// Configuration mistakes (missing token, unshared database) are the common case
// and deserve a one-line explanation, not a stack trace.
class ConfigError extends Error {
  constructor(msg) { super(msg); this.name = 'ConfigError'; this.isConfigError = true; }
}

async function queryAllPages(databaseId) {
  if (!process.env.NOTION_API_KEY) {
    throw new ConfigError(
      'NOTION_API_KEY is empty or unset.\n' +
      '  Local runs: add it to .env  (token: notion.so/my-integrations -> your integration -> Internal Integration Secret)\n' +
      '  CI: add it as a GitHub Actions secret.'
    );
  }
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
    if (!res.ok) {
      // Notion puts the useful detail in the body; res.statusText is often blank.
      const body = await res.json().catch(() => ({}));
      const detail = body.message ? `\n  Notion says: ${body.message}` : '';
      const hint = {
        401: '\n  The API token is missing, invalid or expired.',
        403: '\n  The token is valid but lacks access to this database.',
        404: `\n  Either the id is wrong (is it a *page* id rather than a *database* id?)\n  or the database is not shared with your integration (••• -> Connections).`,
        429: '\n  Rate limited by Notion. Nothing was written; try again shortly.',
      }[res.status] || '';
      throw new ConfigError(`Notion request failed for database ${databaseId}: HTTP ${res.status}${hint}${detail}\n  Run \`npm run verify:notion\` to check every database at once.`);
    }
    const page = await res.json();
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

// Named property access. The blog sync picks properties by *type* ("first date
// property"), which stops working as soon as a schema has two url fields or two
// checkboxes. These accessors look up by name and return a neutral empty value
// when a property is missing or the wrong type, so a typo or rename in Notion
// degrades one field rather than crashing the hourly job.
function readProps(page) {
  const props = (page && page.properties) || {};
  const get = (name, type) => {
    const p = props[name];
    if (!p || (type && p.type !== type)) return null;
    return p;
  };
  const joinRich = arr => (arr || []).map(t => t.plain_text).join('').trim();

  return {
    // Notion always has exactly one title property but its name varies per DB.
    title() {
      const p = Object.values(props).find(x => x.type === 'title');
      return p ? joinRich(p.title) : '';
    },
    text(name) {
      const p = get(name, 'rich_text');
      return p ? joinRich(p.rich_text) : '';
    },
    url(name) {
      const p = get(name, 'url');
      return p && p.url ? p.url.trim() : null;
    },
    multi(name) {
      const p = get(name, 'multi_select');
      return p ? p.multi_select.map(s => s.name) : [];
    },
    select(name) {
      const p = get(name, 'select');
      return p && p.select ? p.select.name : null;
    },
    check(name) {
      const p = get(name, 'checkbox');
      return p ? Boolean(p.checkbox) : false;
    },
    date(name) {
      const p = get(name, 'date');
      return p && p.date ? p.date.start : null;
    },
    number(name) {
      const p = get(name, 'number');
      return p && typeof p.number === 'number' ? p.number : null;
    },
    // True when the DB has no `Published` column at all, so a user who hasn't
    // added the draft gate still sees every row.
    hasProp(name) {
      return Object.prototype.hasOwnProperty.call(props, name);
    },
  };
}

// Route images through Cloudinary's transform pipeline when they are Cloudinary
// URLs; leave any other host untouched so pasting a plain image link still works.
function optimizeCloudinary(url, width = 1200) {
  if (!url) return null;
  if (!/res\.cloudinary\.com\//.test(url) || !url.includes('/upload/')) return url;
  if (/\/upload\/(f_auto|q_auto|w_\d)/.test(url)) return url; // already transformed
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

// Delete pages a generator produced on a previous run but no longer owns (i.e. a
// row was renamed or removed in Notion). Only ever touches slugs recorded in its
// own manifest, so hand-written pages can never be caught by it.
function pruneGenerated(manifestPath, currentSlugs, filenameFor = slug => `${slug}.html`) {
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).slugs || [];
  } catch (e) { /* first run, or manifest missing */ }

  previous
    .filter(slug => !currentSlugs.includes(slug))
    .forEach(slug => {
      const file = filenameFor(slug);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Removed stale page: ${file}`);
      }
    });

  fs.writeFileSync(manifestPath, JSON.stringify({ slugs: currentSlugs }, null, 2) + '\n');
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).slugs || [];
  } catch (e) {
    return [];
  }
}

// Prefer items sharing tags (most overlap first), then fall back to the newest
// remaining items. `items` is expected to be pre-sorted newest-first.
function pickRelated(current, items, tagsOf, limit = 3) {
  const mine = tagsOf(current);
  return items
    .filter(i => i.slug !== current.slug)
    .map((item, i) => ({ item, score: tagsOf(item).filter(t => mine.includes(t)).length, i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .slice(0, limit)
    .map(x => x.item);
}

// Guard every generator: a transient API failure that returns zero rows must
// never blank a committed page and get auto-committed by CI.
function assertNotEmpty(rows, label) {
  if (!rows.length) {
    console.warn(`No ${label} found. Leaving existing HTML untouched.`);
    return false;
  }
  return true;
}

function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

module.exports = {
  SITE, AUTHOR, OG_IMAGE, BASE_KEYWORDS, STATIC_PAGES,
  ConfigError,
  escapeHtml, decodeEntities, replaceBlock, injectMarker, slugify, makeSlug, uniqueSlug,
  extractMarkdownContent, buildExcerpt, queryAllPages, readProps,
  optimizeCloudinary, pruneGenerated, readManifest, pickRelated,
  assertNotEmpty, formatDate,
};
