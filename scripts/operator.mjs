import { readFile } from 'node:fs/promises';
import { Store } from '../lib/store.mjs';

const [command, first, second, ...rest] = process.argv.slice(2);
const store = new Store();
try {
  let result;
  if (command === 'import') result = store.importOpportunity(JSON.parse(await readFile(first, 'utf8')));
  else if (command === 'record') result = store.record(JSON.parse(await readFile(first, 'utf8')));
  else if (command === 'stage') result = store.stage(first, second, rest.join(' '));
  else if (command === 'review') result = store.review(first, second);
  else if (command === 'status') {
    const s = store.snapshot();
    result = { financials: s.financials, opportunities: s.opportunities.length, proposals: s.experiments.length, drafts: s.drafts.length, last_run: s.runs.at(-1) || null };
  } else if (command === 'export') result = store.snapshot();
  else throw new Error('Usage: npm run operator -- import FILE | record FILE | stage ID STATUS "evidence and next step" | review ID approved/rejected/completed | status | export');
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store.close(); }
