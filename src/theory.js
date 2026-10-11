const fs = require('node:fs/promises');
const path = require('node:path');
const { marked } = require('marked');

const THEORY_DIR = path.join(__dirname, '..', 'content', 'theory');

/**
 * Pull $...$ and $$...$$ out before Markdown parsing so underscores and
 * asterisks inside equations are not turned into emphasis. KaTeX renders
 * them in the browser afterwards.
 */
function protectMath(source) {
  const stash = [];
  const text = source.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => {
    stash.push(m);
    return `@@MATH${stash.length - 1}@@`;
  });
  return { text, restore: (html) => html.replace(/@@MATH(\d+)@@/g, (_, i) => escapeHtml(stash[i])) };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Returns rendered HTML for content/theory/<slug>.md, or null if there is none yet. */
async function loadTheory(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  let source;
  try {
    source = await fs.readFile(path.join(THEORY_DIR, `${slug}.md`), 'utf8');
  } catch {
    return null;
  }
  if (!source.trim()) return null;
  const { text, restore } = protectMath(source);
  return restore(marked.parse(text));
}

module.exports = { loadTheory, protectMath };
