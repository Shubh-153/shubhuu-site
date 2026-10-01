#!/usr/bin/env node
// Pre-flight check for the Notion CMS setup.
//
//   npm run verify:notion
//
// Confirms each configured database is reachable by the integration and has the
// property names the generators expect. Read-only — it never writes anything.
require('dotenv').config();

const TOKEN = process.env.NOTION_API_KEY;

// Mirrors NOTION-SETUP.md. `required` here means "the generator can't do
// anything useful without it", not "Notion will reject it".
const SCHEMAS = {
  'NOTION_DATABASE_ID': {
    label: 'Blogs',
    props: [
      { name: null, type: 'title', required: true, note: 'any name — first title property is used' },
    ],
    loose: true, // the blog sync reads by type, not by name
  },
  'NOTION_PROJECTS_DB_ID': {
    label: 'Projects',
    props: [
      { name: null,        type: 'title',        required: true, note: 'any name' },
      { name: 'Tagline',    type: 'rich_text' },
      { name: 'Tech Stack', type: 'multi_select' },
      { name: 'Status',     type: 'select' },
      { name: 'Live URL',   type: 'url' },
      { name: 'Repo URL',   type: 'url' },
      { name: 'Cover',      type: 'url' },
      { name: 'Gallery',    type: 'rich_text' },
      { name: 'Year',       type: 'date' },
      { name: 'Featured',   type: 'checkbox' },
      { name: 'Published',  type: 'checkbox' },
    ],
  },
  'NOTION_ACADEMICS_DB_ID': {
    label: 'Academics',
    props: [
      { name: null,           type: 'title', required: true, note: 'institution name' },
      { name: 'Qualification', type: 'rich_text' },
      { name: 'Period',        type: 'rich_text' },
      { name: 'Location',      type: 'rich_text' },
      { name: 'Score',         type: 'rich_text' },
      { name: 'Order',         type: 'number' },
      { name: 'Published',     type: 'checkbox' },
    ],
  },
  'NOTION_ACHIEVEMENTS_DB_ID': {
    label: 'Achievements',
    props: [
      { name: null,             type: 'title', required: true, note: 'achievement name' },
      { name: 'Issuer',          type: 'rich_text' },
      { name: 'Description',     type: 'rich_text' },
      { name: 'Date',            type: 'date' },
      { name: 'Credential URL',  type: 'url' },
      { name: 'Published',       type: 'checkbox' },
    ],
  },
};

const C = { ok:'\x1b[32m', warn:'\x1b[33m', bad:'\x1b[31m', dim:'\x1b[2m', b:'\x1b[1m', r:'\x1b[0m' };
const OK = `${C.ok}✓${C.r}`, BAD = `${C.bad}✗${C.r}`, WARN = `${C.warn}!${C.r}`;

const clean = id => String(id).trim().replace(/^https?:\/\/[^/]+\//, '').split('?')[0].split('/').pop().replace(/-/g, '');

async function api(path, method = 'GET') {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28' },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function checkDb(envKey, schema) {
  const raw = process.env[envKey];
  console.log(`\n${C.b}${schema.label}${C.r} ${C.dim}(${envKey})${C.r}`);

  if (!raw) {
    console.log(`  ${C.dim}— not set in .env, generator will skip${C.r}`);
    return { status: 'skip' };
  }

  const id = clean(raw);
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    console.log(`  ${BAD} "${raw}" is not a 32-character Notion ID.`);
    return { status: 'fail' };
  }

  const db = await api(`databases/${id}`);
  if (!db.ok) {
    // The most common mistake: pasting the wrapper page's ID instead of the
    // inline database's ID. Detect it and say so explicitly.
    const page = await api(`pages/${id}`);
    if (page.ok) {
      console.log(`  ${BAD} This is a ${C.b}page${C.r} ID, not a ${C.b}database${C.r} ID.`);
      console.log(`     Open the database as a full page (⤢), then copy the id from the URL`);
      console.log(`     — it's the part before "?v=".`);
    } else if (db.status === 404) {
      console.log(`  ${BAD} 404 — database not found, or not shared with your integration.`);
      console.log(`     Fix: open it in Notion → ••• → Connections → add your integration.`);
    } else if (db.status === 401) {
      console.log(`  ${BAD} 401 — NOTION_API_KEY is invalid or expired.`);
    } else {
      console.log(`  ${BAD} ${db.status} — ${db.body.message || 'request failed'}`);
    }
    return { status: 'fail', id };
  }

  const title = (db.body.title || []).map(t => t.plain_text).join('') || '(untitled)';
  console.log(`  ${OK} reachable — "${title}"`);
  if (/^NOTION_[A-Z_]*_DB_ID$/.test(title.trim())) {
    console.log(`     ${C.warn}note:${C.r} that's the name of the GitHub secret, not a great database name.`);
    console.log(`     Harmless — the generators never read the title — but worth renaming.`);
  }

  const actual = db.body.properties || {};
  const byName = new Map(Object.entries(actual).map(([n, p]) => [n, p.type]));
  let missing = 0;

  for (const want of schema.props) {
    if (want.name === null) {
      const t = Object.entries(actual).find(([, p]) => p.type === 'title');
      console.log(t ? `  ${OK} ${'(title)'.padEnd(16)} ${C.dim}"${t[0]}" — ${want.note}${C.r}`
                    : `  ${BAD} no title property found`);
      if (!t) missing++;
      continue;
    }
    const got = byName.get(want.name);
    if (!got) {
      console.log(`  ${BAD} ${want.name.padEnd(16)} ${C.dim}missing (expected ${want.type})${C.r}`);
      missing++;
      const near = [...byName.keys()].find(k => k.toLowerCase() === want.name.toLowerCase());
      if (near) console.log(`     ${C.warn}found "${near}" — names are case-sensitive, rename it${C.r}`);
    } else if (got !== want.type) {
      console.log(`  ${WARN} ${want.name.padEnd(16)} ${C.dim}is ${got}, expected ${want.type}${C.r}`);
      missing++;
    } else {
      console.log(`  ${OK} ${want.name.padEnd(16)} ${C.dim}${got}${C.r}`);
    }
  }

  const rows = await api(`databases/${id}/query`, 'POST').catch(() => null);
  const n = rows && rows.ok ? (rows.body.results || []).length : 0;
  console.log(`  ${n ? OK : WARN} ${n} row(s)${n ? '' : ' — generator will skip and leave the page untouched'}`);

  const extra = [...byName.keys()].filter(k =>
    actual[k].type !== 'title' && !schema.props.some(p => p.name === k));
  if (extra.length && !schema.loose) {
    console.log(`  ${C.dim}  ignored extra properties: ${extra.join(', ')}${C.r}`);
  }
  return { status: missing ? 'partial' : 'ok', id, title };
}

(async () => {
  if (!TOKEN) {
    console.error(`${BAD} NOTION_API_KEY is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  console.log(`${C.b}Notion CMS pre-flight${C.r}`);
  const results = {};
  for (const [k, v] of Object.entries(SCHEMAS)) results[k] = await checkDb(k, v);

  // With several databases living inside one Notion page it is easy to copy the
  // same table's link into two different secrets. Nothing else would catch it:
  // both would resolve fine, and one content type would silently render another's rows.
  const seen = new Map();
  let collision = false;
  for (const [key, r] of Object.entries(results)) {
    if (!r.id || r.status === 'fail') continue;
    if (seen.has(r.id)) {
      collision = true;
      const first = seen.get(r.id);
      console.log(`\n${BAD} ${C.b}${first}${C.r} and ${C.b}${key}${C.r} point at the ${C.b}same database${C.r}`);
      console.log(`   ${C.dim}${r.id}${r.title ? ` — "${r.title}"` : ''}${C.r}`);
      console.log(`   Each content type needs its own database. Re-copy the link from the right table.`);
    } else {
      seen.set(r.id, key);
    }
  }

  const val = Object.values(results).map(r => r.status);
  const bad = val.filter(r => r === 'fail').length;
  const part = val.filter(r => r === 'partial').length;
  console.log(`\n${C.b}Summary:${C.r} ${val.filter(r=>r==='ok').length} ready, ${part} incomplete, ${bad} unreachable`);
  console.log(bad || part || collision ? `See NOTION-SETUP.md for the expected schema.` : `All set — run \`npm run sync:all\`.`);
  process.exit(bad || collision ? 1 : 0);
})();
