import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Ollama } from 'ollama';
import { resolve } from 'node:path';
import { ROOT, runtimeDir } from './config.mjs';

export async function connectMcp(server = 'business-mcp-server.mjs') {
  const client = new Client({ name: 'local-business-agent', version: '0.2.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, server)], env: { ...process.env, BUSINESS_DATA_DIR: runtimeDir() } });
  try { await client.connect(transport); return client; }
  catch (error) { await transport.close(); throw error; }
}

export function localOllama(config, runSignal) {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const parsed = new URL(host);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('This application expects Ollama on this computer. Use a loopback OLLAMA_HOST.');
  return new Ollama({ host, fetch: (url, options = {}) => {
    const signals = [AbortSignal.timeout(config.request_timeout_seconds * 1000), runSignal, options.signal].filter(Boolean);
    return fetch(url, { ...options, signal: AbortSignal.any(signals) });
  } });
}

export async function checkModel(ollama, model) {
  let details;
  try { details = await ollama.show({ model }); }
  catch (error) { throw new Error(`Cannot load model metadata for ${model}. Start Ollama and install that model first. ${error.message}`); }
  if (!details.capabilities?.includes('tools')) throw new Error(`${model} does not report tool calling support in this installation. Choose a tool-capable model and rerun npm run doctor.`);
  if (details.remote_host || details.remote_model || model.includes(':cloud')) throw new Error('Choose a downloaded local model, not a cloud-backed model.');
  return details;
}
