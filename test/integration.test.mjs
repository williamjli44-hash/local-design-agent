import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../lib/store.mjs';
import { ROOT } from '../lib/config.mjs';
import { createDashboard } from '../dashboard-server.mjs';

const exec = promisify(execFile);
const lead = { id: 'lead-one', source_url: 'https://example.com/job', observed_at: '2026-10-12T12:00:00Z', buyer: 'Buyer', need: 'Mobile fix', evidence: 'Test fixture', next_action: 'Scope the repair' };
async function temp(t) {
  const dir = await mkdtemp(join(tmpdir(), 'business agent integration '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('real MCP subprocess exposes operational tools; validates evidence and writes drafts', async t => {
  const dir = await temp(t);
  const store = new Store(dir); store.importOpportunity(lead);
  const client = new Client({ name: 'test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, 'business-mcp-server.mjs')], env: { ...process.env, BUSINESS_DATA_DIR: dir, BRAVE_SEARCH_API_KEY: '' } }));
    const { tools } = await client.listTools();
    assert.ok(tools.some(x => x.name === 'search_opportunities'));
    assert.ok(!tools.some(x => /record|transfer|approve/.test(x.name)));
    const bad = await client.callTool({ name: 'save_draft', arguments: { opportunity_id: 'missing', kind: 'response', content: 'Hello' } });
    assert.equal(bad.isError, true);
    const good = await client.callTool({ name: 'save_draft', arguments: { opportunity_id: lead.id, kind: 'response', content: 'A scoped offer' } });
    assert.ok(!good.isError);
    assert.equal(store.read().drafts[0].content, 'A scoped offer');
  } finally { await client.close(); store.close(); }
});

test('dashboard escapes untrusted text, protects writes, records decisions and serves drafts', async t => {
  const dir = await temp(t);
  const store = new Store(dir);
  store.importOpportunity({ ...lead, buyer: '<script>alert(1)</script>' });
  const draft = store.draft({ opportunity_id: lead.id, kind: 'response', content: '<img src=x onerror=alert(1)>' });
  let launched = 0;
  const server = createDashboard(store, { runDaily: () => { launched++; } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    const html = await response.text();
    assert.match(html, /&lt;script&gt;/); assert.ok(!html.includes('<script>alert'));
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    const token = /name="csrf" value="([^"]+)"/.exec(html)[1];
    const post = (path, data, origin = base) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin }, body: new URLSearchParams(data) });
    assert.equal((await post('/run', { csrf: token }, 'http://evil.example')).status, 403);
    assert.equal((await post('/run', { csrf: 'wrong' })).status, 403);
    assert.equal((await post('/run', { csrf: token })).status, 303); assert.equal(launched, 1);
    assert.equal((await post('/entry', { csrf: token, kind: 'capital', amount: '200', minutes: '', reference: 'first', note: 'Allocated funds' })).status, 303);
    assert.equal(store.snapshot().financials.balance_cents, 20000);
    assert.equal((await post('/stage', { csrf: token, id: lead.id, status: 'contacted', evidence: 'Sent by owner' })).status, 303);
    const proposal = store.propose({ opportunity_id: lead.id, name: 'Offer', purpose: 'Validate', proposed_cost: 0, expected_signal: 'Reply', stop_condition: 'Ten responses' });
    assert.equal((await post('/review', { csrf: token, id: proposal.proposal.id, decision: 'approved' })).status, 303);
    const download = await fetch(`${base}/draft/${draft.id}`);
    assert.match(download.headers.get('content-type'), /text\/plain/);
    assert.equal(await download.text(), '<img src=x onerror=alert(1)>');
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('daily CLI runs a mock Ollama → real MCP → persisted brief and skips repeat run', async t => {
  const dir = await temp(t);
  const store = new Store(dir); store.importOpportunity(lead);
  let requests = 0;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/show') { res.end(JSON.stringify({ capabilities: ['tools'] })); return; }
    const data = JSON.parse(body); requests++;
    if (requests === 1) {
      assert.match(data.messages[0].content, /Revenue operating plan/);
      res.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'save_draft', arguments: { opportunity_id: lead.id, kind: 'response', content: 'Mock-generated scoped offer' } } }] } }));
    } else res.end(JSON.stringify({ message: { role: 'assistant', content: 'Review the saved scoped offer.' } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const options = { cwd: ROOT, env: { ...process.env, BUSINESS_DATA_DIR: dir, BRAVE_SEARCH_API_KEY: '', OLLAMA_MODEL: 'test-local', OLLAMA_HOST: `http://127.0.0.1:${server.address().port}` }, timeout: 20000 };
  try {
    const first = await exec(process.execPath, ['business-agent.mjs', '--once'], options);
    assert.match(first.stdout, /Review the saved/);
    assert.equal(store.read().runs[0].status, 'completed');
    assert.equal(store.read().drafts.length, 1);
    const second = await exec(process.execPath, ['business-agent.mjs', '--once'], options);
    assert.match(second.stdout, /already exists/);
    assert.equal(requests, 2);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('daily CLI without evidence or source credentials asks for input without an LLM', async t => {
  const dir = await temp(t);
  const result = await exec(process.execPath, [resolve(ROOT, 'business-agent.mjs'), '--once'], { env: { ...process.env, BUSINESS_DATA_DIR: dir, BRAVE_SEARCH_API_KEY: '', OLLAMA_HOST: 'http://127.0.0.1:1' }, timeout: 10000 });
  assert.match(result.stdout, /Add a buyer request/);
  const store = new Store(dir);
  try { assert.equal(store.read().runs[0].status, 'waiting_for_input'); }
  finally { store.close(); }
});
