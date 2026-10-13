import { loadConfig } from '../lib/config.mjs';
import { connectMcp, localOllama, checkModel } from '../lib/connections.mjs';
import { loadInstructions } from '../lib/agent-loop.mjs';

let client;
try {
  const config = loadConfig();
  console.log(`Node ${process.version}; model ${config.model}`);
  console.log(`Instructions loaded (${(await loadInstructions()).length} characters).`);
  console.log(`Live research: ${process.env.BRAVE_SEARCH_API_KEY ? 'key configured (not verified)' : 'not configured; use dashboard lead intake'}`);
  client = await connectMcp();
  const { tools } = await client.listTools();
  console.log(`MCP connected: ${tools.map(t => t.name).join(', ')}`);
  await checkModel(localOllama(config), config.model);
  console.log('Ollama is reachable; selected local model reports tool support. Run npm run chat to test its actual behavior.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.close(); }
