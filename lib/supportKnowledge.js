// Loads safe support knowledge files for the Star Support system prompt.
// Reads recursively from support-knowledge/ — no Reader/Oracle internals.

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '../support-knowledge');

function collectMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export function loadSupportKnowledge() {
  const files = collectMarkdownFiles(KNOWLEDGE_DIR);

  return files
    .map(f => fs.readFileSync(f, 'utf8').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
}
