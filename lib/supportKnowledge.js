// Loads safe support knowledge files for the Star Support system prompt.
// Only reads from the support-knowledge/ directory — no Reader/Oracle internals.

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '../support-knowledge');

export function loadSupportKnowledge() {
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  return files
    .map(f => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
}
