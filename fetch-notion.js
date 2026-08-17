require('dotenv').config();
const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

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

async function buildSite() {
  const { marked } = await import('marked');
  
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    console.log("No NOTION_DATABASE_ID provided. Skipping build.");
    return;
  }

  console.log("Fetching database from Notion...");
  const fetchResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  if (!fetchResponse.ok) {
    throw new Error(`Failed to fetch database: ${fetchResponse.statusText}`);
  }
  const response = await fetchResponse.json();

  const blogs = [];

  for (const page of response.results) {
    const titleProperty = Object.values(page.properties).find(p => p.type === 'title');
    const title = titleProperty && titleProperty.title.length > 0 ? titleProperty.title[0].plain_text : 'Untitled';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const dateProperty = Object.values(page.properties).find(p => p.type === 'date');
    let dateStr = page.created_time;
    if (dateProperty && dateProperty.date) dateStr = dateProperty.date.start;
    const date = new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const selectProperty = Object.values(page.properties).find(p => p.type === 'select');
    const multiSelectProperty = Object.values(page.properties).find(p => p.type === 'multi_select');
    let category = 'Blog';
    if (selectProperty && selectProperty.select) category = selectProperty.select.name;
    else if (multiSelectProperty && multiSelectProperty.multi_select.length > 0) {
      category = multiSelectProperty.multi_select.map(s => s.name).join(', ');
    }

    const mdblocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdblocks);
    const markdownContent = extractMarkdownContent(mdString);
    const htmlContent = marked.parse(markdownContent);

    let plainText = htmlContent.replace(/<[^>]+>/g, '');
    let excerpt = plainText.substring(0, 150);
    if (plainText.length > 150) excerpt += '...';

    blogs.push({ title, slug, date, category, excerpt, htmlContent, createdTime: new Date(dateStr) });
  }

  blogs.sort((a, b) => b.createdTime - a.createdTime);

  // 1. Generate individual article HTML pages
  const articleTemplate = fs.readFileSync('article.html', 'utf8');
  blogs.forEach(blog => {
    let articleHtml = articleTemplate;
    articleHtml = articleHtml.replace(/<title>.*?<\/title>/, `<title>${blog.title} | Shubh Gupta</title>`);
    articleHtml = articleHtml.replace(/<h1 class="article-title">.*?<\/h1>/, `<h1 class="article-title">${blog.title}</h1>`);
    articleHtml = articleHtml.replace(/<div class="article-meta">.*?<\/div>/, `<div class="article-meta">${blog.date} • ${blog.category}</div>`);
    
    const contentRegex = /<!-- ARTICLE_CONTENT_START -->[\s\S]*?<!-- ARTICLE_CONTENT_END -->/;
    articleHtml = articleHtml.replace(contentRegex, `<!-- ARTICLE_CONTENT_START -->\n${blog.htmlContent}\n    <!-- ARTICLE_CONTENT_END -->`);
    
    fs.writeFileSync(`${blog.slug}.html`, articleHtml);
  });

  // 2. Update blogs.html list
  let blogsHtml = fs.readFileSync('blogs.html', 'utf8');
  const cardsHtml = blogs.map(blog => `
      <a href="/${blog.slug}.html" class="blog-card">
        <div class="blog-meta">${blog.date} • ${blog.category}</div>
        <h3 class="blog-title">${blog.title}</h3>
        <p class="blog-excerpt">${blog.excerpt}</p>
        <span class="blog-readmore">Read Article ➔</span>
      </a>`).join('\n');
  
  const gridRegex = /<!-- BLOG_CARDS_START -->[\s\S]*?<!-- BLOG_CARDS_END -->/;
  blogsHtml = blogsHtml.replace(gridRegex, `<!-- BLOG_CARDS_START -->\n${cardsHtml}\n      <!-- BLOG_CARDS_END -->`);
  fs.writeFileSync('blogs.html', blogsHtml);

  // 3. Update index.html latest articles
  if (blogs.length > 0) {
    const latestBlogs = blogs.slice(0, 3);
    let indexHtml = fs.readFileSync('index.html', 'utf8');
    
    const latestHtml = `<!-- LATEST_BLOG_START -->
    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${latestBlogs.map(blog => `
      <a href="/${blog.slug}.html" style="text-decoration: none; display: block; border: 1px solid var(--line); border-radius: 8px; padding: 24px; background: var(--bg-raised); transition: transform 0.2s ease, border-color 0.2s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='var(--accent)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--line)';">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <h3 style="font-family: var(--display); font-size: 1.25rem; color: var(--ink); margin: 0; font-weight: 600;">${blog.title}</h3>
          <span style="font-family: var(--mono); font-size: 0.85rem; color: var(--ink-soft);">${blog.date} • ${blog.category}</span>
        </div>
        <p style="color: var(--ink-soft); font-size: 0.95rem; line-height: 1.5; margin: 0 0 16px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${blog.excerpt}</p>
        <span style="font-family: var(--mono); font-size: 0.85rem; color: var(--accent);">Read Article ➔</span>
      </a>`).join('')}
    </div>
    <!-- LATEST_BLOG_END -->`;
    
    const indexRegex = /<!-- LATEST_BLOG_START -->[\\s\\S]*?<!-- LATEST_BLOG_END -->/;
    indexHtml = indexHtml.replace(indexRegex, latestHtml);
    fs.writeFileSync('index.html', indexHtml);
  }

  console.log('Site built successfully with latest Notion data.');
}

buildSite().catch(err => {
  console.error(err);
  process.exit(1);
});
