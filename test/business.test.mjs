import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.mjs';
import { loadConfig } from '../lib/config.mjs';
import { searchOpportunities } from '../lib/research.mjs';
import { checkModel } from '../lib/connections.mjs';
import { runAgent, loadInstructions } from '../lib/agent-loop.mjs';

const lead = id => ({ id, source_url: `https://example.com/${id}`, observed_at: '2026-10-12T12:00:00Z', buyer: `Buyer ${id}`, need: 'Fix a mobile menu', evidence: 'Test fixture only: a scoped buyer request', next_action: 'Confirm access' });
const proposal = (id, cost) => ({ opportunity_id: id, name: 'Validate offer', purpose: 'Test a scoped offer', proposed_cost: cost, expected_signal: 'Buyer replies', stop_condition: 'Ten qualified responses without a reply' });
async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'business-agent-test-'));
  const store = new Store(dir, { ...loadConfig(), ...overrides });
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  return { store, dir };
}

test('ledger starts empty; capital is not profit; costs, refunds and owner time count', async t => {
  const { store } = await fixture(t);
  assert.equal(store.snapshot().financials.balance_cents, 0);
  for (const [kind, amount] of [['capital', 200], ['revenue', 149], ['expense', 5], ['fee', 22.35], ['refund', 10]]) store.record({ kind, amount, reference: kind, note: 'Receipt fixture' });
  store.record({ kind: 'owner_time', minutes: 120, reference: 'time', note: 'Work log' });
  const f = store.snapshot().financials;
  assert.equal(f.balance_cents, 31165);
  assert.equal(f.cash_contribution_cents, 11165);
  assert.equal(f.contribution_after_time_cents, 6165);
  assert.equal(f.owner_minutes, 120);
});

test('repeated receipt is idempotent, conflicts and fractional cents fail without writes', async t => {
  const { store } = await fixture(t);
  const entry = { kind: 'capital', amount: 200, reference: 'receipt-1', note: 'Owner funding' };
  assert.equal(store.record(entry).id, store.record(entry).id);
  assert.throws(() => store.record({ ...entry, amount: 201 }), /Reference already/);
  assert.throws(() => store.record({ ...entry, reference: 'bad', amount: 1.005 }), /decimal/);
  assert.equal(store.read().entries.length, 1);
});

test('aggregate budgets, no fake spending, duplicate proposals and review lifecycle', async t => {
  const { store } = await fixture(t);
  store.record({ kind: 'capital', amount: 200, reference: 'capital', note: 'Owner funding' });
  for (const id of ['one', 'two']) store.importOpportunity(lead(id));
  const first = store.propose(proposal('one', 15));
  assert.equal(first.proposal.status, 'pending_approval');
  assert.equal(store.propose(proposal('one', 15)).proposal.id, first.proposal.id);
  assert.equal(store.propose(proposal('two', 15)).proposal.status, 'rejected_by_budget');
  assert.equal(store.snapshot().financials.balance_cents, 20000);
  store.review(first.proposal.id, 'approved');
  assert.throws(() => store.review(first.proposal.id, 'approved'), /Cannot/);
  store.review(first.proposal.id, 'completed');
  assert.equal(store.snapshot().financials.reserved_cents, 0);
});

test('unrecovered expenses constrain later plans and zero-cost validation works without capital', async t => {
  const { store } = await fixture(t, { daily_spend_limit: 100 });
  store.importOpportunity(lead('free'));
  assert.equal(store.propose(proposal('free', 0)).proposal.status, 'pending_approval');
  store.record({ kind: 'capital', amount: 200, reference: 'funds', note: 'Funding' });
  store.record({ kind: 'expense', amount: 45, reference: 'expense', note: 'Prior experiment' });
  store.importOpportunity(lead('paid'));
  assert.equal(store.propose(proposal('paid', 10)).proposal.status, 'rejected_by_budget');
});

test('source deduplication, draft updates, and persistence across connections', async t => {
  const { store, dir } = await fixture(t);
  store.importOpportunity(lead('one'));
  assert.throws(() => store.importOpportunity({ ...lead('one'), id: 'alias' }), /Source already/);
  const a = store.draft({ opportunity_id: 'one', kind: 'response', content: 'First' });
  const b = store.draft({ opportunity_id: 'one', kind: 'response', content: 'Revised' });
  assert.equal(a.id, b.id);
  assert.equal(store.read().drafts.length, 1);
  const second = new Store(dir);
  try { second.stage('one', 'contacted', 'Owner sent the offer'); assert.equal(store.read().opportunities[0].status, 'contacted'); }
  finally { second.close(); }
});

test('search uses fixed endpoint, caches requests, preserves provenance, and enforces budget', async t => {
  const { store } = await fixture(t, { max_searches_per_day: 1 });
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.search.brave.com');
    assert.equal(options.headers['X-Subscription-Token'], 'test-secret');
    return { ok: true, json: async () => ({ web: { results: [{ url: 'https://example.com/request', title: 'CSS repair requested', description: 'Actual source snippet fixture' }] } }) };
  };
  const a = await searchOpportunities(store, 'CSS repair job', { apiKey: 'test-secret', fetcher });
  await searchOpportunities(store, 'CSS repair job', { apiKey: 'test-secret', fetcher });
  assert.equal(calls, 1);
  await assert.rejects(searchOpportunities(store, 'other job', { apiKey: 'test-secret', fetcher }), /limit/);
  const captured = store.captureSearchResult(a.results[0].id);
  assert.match(captured.evidence, /UNVERIFIED/);
  assert.equal(captured.source_url, 'https://example.com/request');
  assert.equal(store.captureSearchResult(a.results[0].id).id, captured.id);
  assert.throws(() => store.captureSearchResult('invented'), /source ID/);
  assert.ok(!JSON.stringify(store.read()).includes('test-secret'));
});

test('missing search key and failed provider do not fabricate sources or leak secrets', async t => {
  const { store } = await fixture(t);
  await assert.rejects(searchOpportunities(store, 'query', { apiKey: '' }), /BRAVE/);
  await assert.rejects(searchOpportunities(store, 'query', { apiKey: 'secret', fetcher: async () => { throw new Error('secret'); } }), /Search request failed/);
  assert.equal(store.read().searches[0].status, 'failed');
  assert.equal(store.read().opportunities.length, 0);
  assert.ok(!JSON.stringify(store.read()).includes('secret'));
});

test('daily runs deduplicate; active work blocks overlap; failed work can retry', async t => {
  const { store } = await fixture(t);
  const run = store.startRun('daily:day-one');
  assert.throws(() => store.startRun('other'), /active/);
  store.finishRun(run.id, { status: 'failed' });
  const retry = store.startRun('daily:day-one');
  store.finishRun(retry.id, { status: 'completed' });
  assert.equal(store.startRun('daily:day-one'), null);
});

test('runner includes real strategy and returns MCP result to model before final answer', async () => {
  let turns = 0;
  const config = loadConfig();
  const result = await runAgent({ prompt: 'Daily brief', instructions: await loadInstructions(), tools: [{ name: 'get_account_overview', inputSchema: {} }], config,
    chat: async req => {
      turns++;
      assert.match(req.messages[0].content, /\$149/);
      if (turns === 1) return { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_account_overview', arguments: {} } }] } };
      assert.match(req.messages.at(-1).content, /balance_cents/);
      return { message: { role: 'assistant', content: 'Owner action needed.' } };
    }, callTool: async () => ({ content: [{ type: 'text', text: '{"balance_cents":20000}' }] }) });
  assert.equal(result.calls, 1);
  assert.equal(result.status, 'completed');
});

test('unavailable tools are never executed; runaway model exits explicitly', async () => {
  let executed = 0;
  const result = await runAgent({ prompt: 'Go', instructions: 'Test', tools: [], config: { ...loadConfig(), max_turns: 2, max_tool_calls: 1 }, chat: async () => ({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_money', arguments: {} } }] } }), callTool: async () => { executed++; } });
  assert.equal(executed, 0);
  assert.equal(result.status, 'limited');
});

test('model preflight rejects unsupported or cloud-backed models', async () => {
  await assert.rejects(checkModel({ show: async () => ({ capabilities: [] }) }, 'local'), /tool calling/);
  await assert.rejects(checkModel({ show: async () => ({ capabilities: ['tools'], remote_host: 'remote' }) }, 'local'), /cloud/);
  await checkModel({ show: async () => ({ capabilities: ['tools'] }) }, 'local');
});

test('context overflow stops before inference and leaves tool execution untouched', async () => {
  let inferred = false;
  const result = await runAgent({ prompt: 'Review', instructions: 'x'.repeat(100000), tools: [], config: loadConfig(), chat: async () => { inferred = true; }, callTool: async () => assert.fail('No tool should run') });
  assert.equal(inferred, false);
  assert.equal(result.status, 'limited');
  assert.match(result.report, /Context budget/);
});

test('truncated model output never executes an incomplete tool call', async () => {
  const result = await runAgent({ prompt: 'Review', instructions: 'Test', tools: [{ name: 'save_draft', inputSchema: {} }], config: loadConfig(),
    chat: async () => ({ done_reason: 'length', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'save_draft', arguments: {} } }] } }),
    callTool: async () => assert.fail('No incomplete tool should run') });
  assert.equal(result.calls, 0);
  assert.equal(result.status, 'limited');
  assert.match(result.report, /output limit/);
});
