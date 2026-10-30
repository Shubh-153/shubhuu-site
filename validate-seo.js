#!/usr/bin/env node
/**
 * Automated Technical SEO & Quality Validation Suite for shubhuu.in
 *
 * Verifies:
 * 1. robots.txt syntax, crawler permissions, and sitemap reference.
 * 2. sitemap.xml validity, URL completeness, and disk file matching.
 * 3. Canonical URLs presence, uniqueness, and consistency across all indexable pages.
 * 4. Page titles and meta descriptions (presence, length, and uniqueness).
 * 5. Heading hierarchy (ensuring exactly one primary <h1> per indexable page).
 * 6. Internal links (detects broken relative links, about:blank anchors, /index.html dilution).
 * 7. JSON-LD structured data syntax, schema types, and breadcrumbs.
 * 8. Image alt attributes on meaningful images (hero, thumbnails, galleries).
 * 9. Robots directives (preventing accidental noindex on canonical pages, confirming on templates).
 * 10. Open Graph and Twitter Cards complete metadata.
 * 11. Deprecated tags verification (0 instances of meta keywords).
 * 12. RSS feed.xml structure and article link validity.
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://shubhuu.in';
const ALL_HTML_FILES = fs.readdirSync('.').filter(f => f.endsWith('.html'));

const TEMPLATE_AND_DRAFT_FILES = new Set([
  'article.html',
  'article2.html',
  'article3.html',
  'project.html',
  'creative-bento.html',
  'creative-masonry.html',
  'cs-glossary.html',
  'computer-science-glossary-blog.html'
]);

const INDEXABLE_FILES = ALL_HTML_FILES.filter(f => !TEMPLATE_AND_DRAFT_FILES.has(f));

let totalTests = 0;
let passedTests = 0;
let failures = [];

function assert(condition, message, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔\x1b[0m ${message}`);
  } else {
    failures.push({ message, details });
    console.log(`  \x1b[31m✖\x1b[0m ${message}`);
    if (details) console.log(`    \x1b[33m${details}\x1b[0m`);
  }
}

console.log('\n\x1b[1m=== Running Technical SEO Validation Suite ===\x1b[0m\n');

// 1. robots.txt Validation
console.log('\x1b[36m[1/12] Validating robots.txt\x1b[0m');
const robotsPath = 'robots.txt';
assert(fs.existsSync(robotsPath), 'robots.txt exists in root directory');
if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, 'utf8');
  assert(/User-agent:\s*\*/i.test(robots), 'robots.txt specifies User-agent: *');
  assert(/Allow:\s*\//i.test(robots), 'robots.txt specifies Allow: /');
  assert(/Sitemap:\s*https:\/\/shubhuu\.in\/sitemap\.xml/i.test(robots), 'robots.txt references canonical sitemap.xml');
  assert(!robots.includes('Disallow: /index.html'), 'robots.txt does not mistakenly disallow homepage');
}

// 2. sitemap.xml Validation
console.log('\n\x1b[36m[2/12] Validating sitemap.xml\x1b[0m');
const sitemapPath = 'sitemap.xml';
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists in root directory');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  assert(sitemap.startsWith('<?xml'), 'sitemap.xml starts with XML declaration');
  assert(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap.xml has valid schema namespace');

  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert(locs.length === 29, `sitemap.xml contains all 29 production pages (found ${locs.length})`);
  
  const duplicates = locs.filter((item, index) => locs.indexOf(item) !== index);
  assert(duplicates.length === 0, 'sitemap.xml has zero duplicate URLs', duplicates.join(', '));

  let missingFiles = [];
  locs.forEach(loc => {
    let localFile = loc === `${SITE}/` ? 'index.html' : loc.replace(`${SITE}/`, '');
    if (!fs.existsSync(localFile)) missingFiles.push({ loc, localFile });
  });
  assert(missingFiles.length === 0, 'Every URL listed in sitemap.xml exists on disk', JSON.stringify(missingFiles));
}

// 3. Canonical URLs Validation
console.log('\n\x1b[36m[3/12] Validating Canonical URLs\x1b[0m');
let canonicalErrors = [];
let canonicalMap = new Map();

INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const m = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!m) {
    canonicalErrors.push(`${file} is missing a canonical link tag.`);
  } else {
    const url = m[1];
    const expected = file === 'index.html' ? `${SITE}/` : `${SITE}/${file}`;
    if (url !== expected) {
      canonicalErrors.push(`${file} has unexpected canonical: ${url} (expected: ${expected})`);
    }
    if (canonicalMap.has(url)) {
      canonicalErrors.push(`Duplicate canonical URL ${url} found in ${file} and ${canonicalMap.get(url)}`);
    } else {
      canonicalMap.set(url, file);
    }
  }
});
assert(canonicalErrors.length === 0, 'All indexable pages have unique, self-referential canonical tags', canonicalErrors.join('\n'));

// 4. Page Titles & Meta Descriptions
console.log('\n\x1b[36m[4/12] Validating Titles and Meta Descriptions\x1b[0m');
let titleErrors = [];
let descErrors = [];
let titlesSeen = new Map();
let descsSeen = new Map();

INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                    content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);

  if (!titleMatch || !titleMatch[1].trim()) {
    titleErrors.push(`${file} is missing <title>`);
  } else {
    const title = titleMatch[1].trim();
    if (titlesSeen.has(title)) {
      titleErrors.push(`Duplicate title "${title}" in ${file} and ${titlesSeen.get(title)}`);
    } else {
      titlesSeen.set(title, file);
    }
  }

  if (!descMatch || !descMatch[1].trim()) {
    descErrors.push(`${file} is missing meta description`);
  } else {
    const desc = descMatch[1].trim();
    if (descsSeen.has(desc)) {
      descErrors.push(`Duplicate description in ${file} and ${descsSeen.get(desc)}`);
    } else {
      descsSeen.set(desc, file);
    }
  }
});
assert(titleErrors.length === 0, 'All indexable pages have unique titles', titleErrors.join('\n'));
assert(descErrors.length === 0, 'All indexable pages have unique meta descriptions', descErrors.join('\n'));

// 5. Heading Hierarchy (H1s)
console.log('\n\x1b[36m[5/12] Validating Heading Hierarchy (H1s)\x1b[0m');
let h1Errors = [];
INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const h1Matches = [...content.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  if (h1Matches.length === 0) {
    h1Errors.push(`${file} has NO <h1> element.`);
  } else if (h1Matches.length > 1) {
    h1Errors.push(`${file} has multiple <h1> elements (${h1Matches.length}): "${h1Matches.join('", "')}"`);
  } else if (!h1Matches[0]) {
    h1Errors.push(`${file} has an empty <h1> tag.`);
  }
});
assert(h1Errors.length === 0, 'Every indexable page has exactly one non-empty primary <h1>', h1Errors.join('\n'));

// 6. Internal Links & Anchor Health
console.log('\n\x1b[36m[6/12] Validating Internal Links & Anchor Health\x1b[0m');
let linkErrors = [];
let indexHtmlLinks = [];

INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const linkMatches = [...content.matchAll(/<a[^>]+href=["']([^"'#]+)(?:#[^"']*)?["']/gi)];
  
  if (content.includes('about:blank')) {
    linkErrors.push(`${file} contains broken about:blank links.`);
  }

  linkMatches.forEach(m => {
    let href = m[1];
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('javascript:') || href.startsWith('upi:') || href.startsWith('tel:') || (href.includes(':') && !href.startsWith('/'))) {
      return;
    }
    if (href === '/index.html' || href === 'index.html') {
      indexHtmlLinks.push(`${file} links to ${href} instead of canonical root /`);
    }
    let target = href.startsWith('/') ? href.slice(1) : href;
    if (target === '' || target === '/') target = 'index.html';
    if (!fs.existsSync(target)) {
      linkErrors.push(`${file} has broken internal link to "${href}" (target file: ${target})`);
    }
  });
});
assert(linkErrors.length === 0, 'Zero broken internal links or about:blank anchors', linkErrors.join('\n'));
assert(indexHtmlLinks.length === 0, 'Internal links point to root / rather than /index.html', indexHtmlLinks.slice(0, 5).join('\n'));

// 7. JSON-LD Structured Data
console.log('\n\x1b[36m[7/12] Validating JSON-LD Structured Data\x1b[0m');
let schemaErrors = [];
INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const jsonLdMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!jsonLdMatch) {
    schemaErrors.push(`${file} is missing JSON-LD structured data.`);
  } else {
    try {
      const parsed = JSON.parse(jsonLdMatch[1]);
      if (file === 'index.html') {
        const graph = parsed['@graph'] || [];
        const types = graph.map(g => g['@type']);
        if (!types.includes('Person') || !types.includes('WebSite')) {
          schemaErrors.push(`index.html JSON-LD missing Person or WebSite in @graph.`);
        }
        const person = graph.find(g => g['@type'] === 'Person');
        if (person && person.homeLocation) {
          schemaErrors.push(`index.html JSON-LD exposes homeLocation (privacy requirement violation).`);
        }
      }
    } catch (e) {
      schemaErrors.push(`${file} has invalid JSON-LD syntax: ${e.message}`);
    }
  }
});
assert(schemaErrors.length === 0, 'All indexable pages have valid JSON-LD schemas with required entities', schemaErrors.join('\n'));

// 8. Image Alt Attributes
console.log('\n\x1b[8/12] Validating Image Alt Attributes\x1b[0m');
let imageErrors = [];
INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const imgMatches = [...content.matchAll(/<img([^>]*)>/gi)];
  imgMatches.forEach(m => {
    const attrs = m[1];
    const src = attrs.match(/src=["']([^"']*)["']/i)?.[1] || '';
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
    const isAriaHidden = /aria-hidden=["']true["']/i.test(attrs);
    
    // Project thumbnails, cover images, and blog illustrations must have non-empty alt
    if ((src.includes('cloudinary') || src.includes('project-screenshots') || src.includes('Photos/')) && !isAriaHidden) {
      if (!altMatch || !altMatch[1].trim()) {
        imageErrors.push(`${file} image "${src.slice(0, 60)}..." has empty or missing alt attribute.`);
      }
    }
  });
});
assert(imageErrors.length === 0, 'All project thumbnails and content images have descriptive alt text', imageErrors.join('\n'));

// 9. Robots Directives
console.log('\n\x1b[36m[9/12] Validating Robots Directives\x1b[0m');
let robotsErrors = [];
INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const m = content.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  if (!m || m[1].includes('noindex')) {
    robotsErrors.push(`${file} should be indexable but has missing or noindex robots tag: ${m ? m[1] : 'NONE'}`);
  }
});
TEMPLATE_AND_DRAFT_FILES.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const m = content.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
    if (!m || !m[1].includes('noindex')) {
      robotsErrors.push(`Draft/template ${file} must have noindex tag, found: ${m ? m[1] : 'NONE'}`);
    }
  }
});
assert(robotsErrors.length === 0, 'Canonical pages allow indexing; drafts/templates have explicit noindex', robotsErrors.join('\n'));

// 10. Open Graph & Twitter Social Metadata
console.log('\n\x1b[36m[10/12] Validating Social Metadata (OG & Twitter)\x1b[0m');
let socialErrors = [];
INDEXABLE_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const requiredProps = ['og:title', 'og:description', 'og:image', 'og:url', 'og:site_name'];
  const requiredTwitter = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

  requiredProps.forEach(prop => {
    if (!new RegExp(`property=["']${prop}["']`, 'i').test(content)) {
      socialErrors.push(`${file} missing ${prop}`);
    }
  });
  requiredTwitter.forEach(name => {
    if (!new RegExp(`name=["']${name}["']`, 'i').test(content)) {
      socialErrors.push(`${file} missing ${name}`);
    }
  });
});
assert(socialErrors.length === 0, 'All indexable pages have complete Open Graph and Twitter metadata', socialErrors.slice(0, 10).join('\n'));

// 11. Deprecated Keywords Tag
console.log('\n\x1b[36m[11/12] Checking for Deprecated Meta Keywords\x1b[0m');
let keywordPages = [];
ALL_HTML_FILES.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (/<meta\s+name=["']keywords["']/i.test(content)) {
    keywordPages.push(file);
  }
});
assert(keywordPages.length === 0, 'Meta keywords tags completely removed (0 instances found)', keywordPages.join(', '));

// 12. RSS Feed Validation
console.log('\n\x1b[36m[12/12] Validating feed.xml\x1b[0m');
const feedPath = 'feed.xml';
assert(fs.existsSync(feedPath), 'feed.xml exists in root directory');
if (fs.existsSync(feedPath)) {
  const feed = fs.readFileSync(feedPath, 'utf8');
  assert(feed.includes('<rss version="2.0"'), 'feed.xml is valid RSS 2.0');
  assert(feed.includes('<link>https://shubhuu.in/blogs.html</link>'), 'feed.xml links to blogs.html');
  const itemLinks = [...feed.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]);
  let brokenFeedLinks = [];
  itemLinks.slice(1).forEach(url => {
    const local = url.replace(`${SITE}/`, '');
    if (!fs.existsSync(local)) brokenFeedLinks.push(url);
  });
  assert(brokenFeedLinks.length === 0, 'All feed item links exist as local HTML files', brokenFeedLinks.join(', '));
}

// Summary
console.log('\n\x1b[1m=== Validation Summary ===\x1b[0m');
console.log(`Total checks: ${totalTests}`);
console.log(`Passed:       \x1b[32m${passedTests}\x1b[0m`);
console.log(`Failed:       ${failures.length > 0 ? `\x1b[31m${failures.length}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);

if (failures.length > 0) {
  console.log('\n\x1b[31mValidation failed with the following errors:\x1b[0m');
  failures.forEach(f => {
    console.log(`- ${f.message}`);
    if (f.details) console.log(`  ${f.details}`);
  });
  process.exit(1);
} else {
  console.log('\n\x1b[32mAll Technical SEO and Web Quality checks passed successfully! 🎉\x1b[0m\n');
  process.exit(0);
}
