require('dotenv').config();

const fs = require('fs');
const {
  escapeHtml, injectMarker, queryAllPages, readProps,
  assertNotEmpty, formatDate,
} = require('./lib/notion');

// Notion rows are plain text; the entry markup is fixed, so no page bodies are
// fetched here (unlike blogs/projects, these are list entries, not documents).
function readRows(pages) {
  return pages
    .map(page => ({ page, p: readProps(page) }))
    .filter(({ p }) => !(p.hasProp('Published') && !p.check('Published')));
}

function educationEntry(e) {
  const meta = [];
  if (e.qualification) {
    meta.push(`        <div class="entry-meta" style="color:var(--accent);">${escapeHtml(e.qualification)}</div>`);
  }
  const descParts = [];
  if (e.location) descParts.push(escapeHtml(e.location));
  if (e.score) descParts.push(`<span class="entry-score">${escapeHtml(e.score)}</span>`);

  return `      <div class="entry">
        <div class="entry-top">
          <div class="entry-title">${escapeHtml(e.institution)}</div>
${e.period ? `          <div class="entry-meta">${escapeHtml(e.period)}</div>\n` : ''}        </div>
${meta.join('\n')}${meta.length ? '\n' : ''}${descParts.length ? `        <div class="entry-desc">${descParts.join(' &nbsp;&bull;&nbsp; ')}</div>\n` : ''}      </div>`;
}

function achievementEntry(a) {
  const link = a.credentialUrl
    ? `\n        <a class="entry-credential" href="${escapeHtml(a.credentialUrl)}" target="_blank" rel="noopener noreferrer">View credential &#8599;</a>`
    : '';
  return `      <div class="entry">
        <div class="entry-top">
          <div class="entry-title">${escapeHtml(a.title)}</div>
${a.dateLabel ? `          <div class="entry-meta">${escapeHtml(a.dateLabel)}</div>\n` : ''}        </div>
${a.issuer ? `        <div class="entry-meta" style="color:var(--accent);">${escapeHtml(a.issuer)}</div>\n` : ''}${a.description ? `        <div class="entry-desc">${escapeHtml(a.description)}</div>` : ''}${link}
      </div>`;
}

async function buildProfile() {
  const eduId = process.env.NOTION_ACADEMICS_DB_ID;
  const achId = process.env.NOTION_ACHIEVEMENTS_DB_ID;

  if (!eduId && !achId) {
    console.log('No NOTION_ACADEMICS_DB_ID or NOTION_ACHIEVEMENTS_DB_ID provided. Skipping profile build.');
    return;
  }

  let academicsHtml = fs.readFileSync('academics.html', 'utf8');
  let touchedAcademics = false;
  let education = [];

  // ---- Education ----
  if (eduId) {
    console.log('Fetching academics database from Notion...');
    const rows = readRows(await queryAllPages(eduId));
    education = rows.map(({ p }) => ({
      institution: p.title() || 'Untitled',
      qualification: p.text('Qualification'),
      period: p.text('Period'),
      location: p.text('Location'),
      score: p.text('Score'),
      order: p.number('Order'),
    }));
    // Highest Order first so the newest qualification leads; rows without an
    // Order keep their Notion sequence behind those that have one.
    education.sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity));

    if (assertNotEmpty(education, 'published academics entries')) {
      academicsHtml = injectMarker(
        academicsHtml, 'EDUCATION',
        education.map(educationEntry).join('\n'), '      '
      );
      touchedAcademics = true;
      console.log(`  ${education.length} education entry(s).`);
    }
  }

  // ---- Achievements ----
  if (achId) {
    console.log('Fetching achievements database from Notion...');
    const rows = readRows(await queryAllPages(achId));
    const achievements = rows.map(({ page, p }) => {
      const d = p.date('Date');
      return {
        title: p.title() || 'Untitled',
        issuer: p.text('Issuer'),
        description: p.text('Description'),
        credentialUrl: p.url('Credential URL'),
        dateLabel: d ? formatDate(d) : '',
        sortKey: new Date(d || page.created_time).getTime(),
      };
    });
    achievements.sort((a, b) => b.sortKey - a.sortKey);

    if (assertNotEmpty(achievements, 'published achievements')) {
      academicsHtml = injectMarker(
        academicsHtml, 'ACHIEVEMENTS',
        achievements.map(achievementEntry).join('\n'), '      '
      );
      touchedAcademics = true;
      console.log(`  ${achievements.length} achievement(s).`);
    }
  }

  if (touchedAcademics) fs.writeFileSync('academics.html', academicsHtml);

  // ---- Homepage highlight: the top two education entries ----
  if (education.length) {
    let indexHtml = fs.readFileSync('index.html', 'utf8');
    indexHtml = injectMarker(
      indexHtml, 'ACADEMICS_HIGHLIGHT',
      `    <div class="entry-list" style="margin-bottom:32px;">\n`
      + education.slice(0, 2).map(educationEntry).join('\n')
      + `\n    </div>`,
      '    '
    );
    fs.writeFileSync('index.html', indexHtml);
  }

  console.log('Profile built successfully.');
}

if (require.main === module) {
  buildProfile().catch(err => {
    console.error(err.isConfigError ? `\n${err.message}\n` : err);
    process.exit(1);
  });
}

module.exports = { buildProfile, educationEntry, achievementEntry };
