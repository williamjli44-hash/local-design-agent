import readline from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/config.mjs';
import { Store } from './lib/store.mjs';
import { connectMcp, localOllama, checkModel } from './lib/connections.mjs';
import { runAgent, loadInstructions } from './lib/agent-loop.mjs';

const { values } = parseArgs({ options: { once: { type: 'boolean' }, force: { type: 'boolean' }, prompt: { type: 'string' } } });
const config = loadConfig();
const store = new Store();
let client;
let rl;

async function execute(prompt, daily = false) {
  const key = daily && !values.force ? `daily:${new Date().toISOString().slice(0, 10)}` : `manual:${randomUUID()}`;
  const run = store.startRun(key);
  if (!run) { console.log('Today’s daily brief already exists. See the dashboard or use --force after adding new evidence.'); return; }
  try {
    if (daily && store.read().opportunities.length === 0 && !process.env.BRAVE_SEARCH_API_KEY) {
      const result = { status: 'waiting_for_input', report: 'Add a buyer request in the dashboard or configure BRAVE_SEARCH_API_KEY in .env for live research. The service offer is in OFFER.md. No buyer evidence or search credentials are available yet.', calls: 0 };
      store.finishRun(run.id, result); console.log(result.report); return;
    }
    const signal = AbortSignal.timeout(config.run_timeout_seconds * 1000);
    const ollama = localOllama(config, signal);
    await checkModel(ollama, config.model);
    client ||= await connectMcp();
    const { tools } = await client.listTools();
    const result = await runAgent({
      prompt, instructions: await loadInstructions(), tools, config,
      chat: request => ollama.chat(request),
      callTool: request => client.callTool(request, undefined, { timeout: 15000, signal }),
      onCall: (name, error) => console.log(`MCP ${name}${error ? ' (returned error)' : ''}`)
    });
    store.finishRun(run.id, result);
    console.log(`\n${result.report}\n`);
    if (result.status === 'limited') process.exitCode = 2;
  } catch (error) {
    store.finishRun(run.id, { status: 'failed', error: error.message, report: `Run failed: ${error.message}` });
    throw error;
  }
}

try {
  if (values.once || values.prompt) {
    await execute(values.prompt || 'Run the daily business review using the strategy, stored evidence, and previous work. Save useful drafts and give the owner one concrete next action.', Boolean(values.once));
  } else {
    console.log(`Local Business Agent · ${config.model}\nEach request loads the strategy and persisted business context. Type exit to quit.`);
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for await (const line of rl) {
      const prompt = line.trim();
      if (prompt.toLowerCase() === 'exit') break;
      if (prompt) await execute(prompt);
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl?.close(); await client?.close(); store.close(); }
