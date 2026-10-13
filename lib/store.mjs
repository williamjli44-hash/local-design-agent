import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cents, loadConfig, runtimeDir } from './config.mjs';

const text = z.string().trim().min(1).max(6000);
const short = z.string().trim().min(1).max(160);
export const opportunitySchema = z.object({
  id: short.regex(/^[a-zA-Z0-9_-]+$/),
  source_url: z.string().url().refine(value => /^https?:\/\//.test(value)),
  observed_at: z.string().datetime({ offset: true }), buyer: short,
  need: text, evidence: text, next_action: text,
  status: z.enum(['new', 'contacted', 'replied', 'won', 'delivered', 'lost']).default('new')
}).strict();
export const proposalSchema = z.object({
  opportunity_id: short, name: short, purpose: text,
  proposed_cost: z.number().finite().nonnegative().max(1000000),
  expected_signal: text, stop_condition: text
}).strict();
export const draftSchema = z.object({
  opportunity_id: short, kind: z.enum(['response', 'delivery_plan', 'follow_up', 'deliverable']),
  content: z.string().trim().min(1).max(18000)
}).strict();
export const entrySchema = z.object({
  kind: z.enum(['capital', 'revenue', 'expense', 'fee', 'refund', 'owner_time']),
  amount: z.number().finite().nonnegative().max(1000000).default(0),
  minutes: z.number().int().nonnegative().max(100000).default(0),
  reference: short, note: text, opportunity_id: short.optional()
}).strict();

export function summarize(state, config) {
  const rows = state.entries;
  const sum = kind => rows.filter(e => e.kind === kind).reduce((n, e) => n + e.amount_cents, 0);
  const capital = sum('capital');
  const revenue = sum('revenue');
  const cost = sum('expense') + sum('fee') + sum('refund');
  const minutes = rows.reduce((n, e) => n + e.minutes, 0);
  const profit = revenue - cost;
  return {
    label: 'Owner-recorded receipts and expenses — not bank verified',
    capital_cents: capital, revenue_cents: revenue, cost_cents: cost,
    cash_contribution_cents: profit, balance_cents: capital + profit,
    owner_minutes: minutes,
    contribution_after_time_cents: profit - Math.round(minutes / 60 * cents(config.owner_hourly_rate)),
    reserved_cents: state.experiments.filter(e => ['pending_approval', 'approved'].includes(e.status)).reduce((n, e) => n + e.cost_cents, 0)
  };
}

export class Store {
  constructor(dir = runtimeDir(), config = loadConfig()) {
    this.config = config;
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(resolve(dir, 'business.sqlite'));
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id=1), body TEXT NOT NULL);');
    const initial = {
      schema: 1, opportunities: [], experiments: [], drafts: [], runs: [], activity: [], searches: [],
      entries: []
    };
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initial));
  }
  close() { this.db.close(); }
  read() { return JSON.parse(this.db.prepare('SELECT body FROM state WHERE id=1').get().body); }
  snapshot() { const state = this.read(); return { ...state, financials: summarize(state, this.config), policy: this.config }; }
  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const result = fn(state);
      this.db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  log(state, message) {
    state.activity.push({ time: new Date().toISOString(), message });
    state.activity = state.activity.slice(-500);
  }
  importOpportunity(input) {
    const row = opportunitySchema.parse(input);
    return this.change(s => {
      const old = s.opportunities.find(e => e.id === row.id);
      if (old) {
        if (JSON.stringify(old) === JSON.stringify(row)) return old;
        throw new Error('Opportunity ID already exists. Use a new ID or the stage command; existing evidence is preserved.');
      }
      if (s.opportunities.some(e => e.source_url === row.source_url)) throw new Error('Source already imported; update its stage rather than duplicating the lead.');
      s.opportunities.push(row);
      this.log(s, `Imported opportunity ${row.id}`);
      return row;
    });
  }
  stage(id, status, evidence) {
    opportunitySchema.shape.status.parse(status); text.parse(evidence);
    return this.change(s => {
      const row = this.findOpportunity(s, id);
      row.status = status; row.next_action = evidence;
      this.log(s, `Owner recorded ${id}: ${status}; ${evidence}`);
      return row;
    });
  }
  findOpportunity(s, id) {
    const row = s.opportunities.find(e => e.id === id);
    if (!row) throw new Error('Import the source evidence before using this opportunity ID.');
    return row;
  }
  reserveSearch(query) {
    text.max(300).parse(query);
    return this.change(s => {
      s.searches ||= [];
      const date = new Date().toISOString().slice(0, 10);
      const previous = s.searches.find(r => r.date === date && r.query === query && ['complete', 'running'].includes(r.status));
      if (previous) return { ...previous, cached: true };
      if (s.searches.filter(r => r.date === date).length >= this.config.max_searches_per_day) throw new Error('Daily search request limit reached.');
      const row = { id: randomUUID(), date, query, status: 'running', results: [] };
      s.searches.push(row);
      return row;
    });
  }
  finishSearch(id, results, error) {
    return this.change(s => {
      const row = s.searches.find(r => r.id === id);
      row.status = error ? 'failed' : 'complete';
      row.results = results; row.error = error || null;
      this.log(s, `Search ${row.status}: ${row.query}`);
      return row;
    });
  }
  captureSearchResult(id) {
    const result = (this.read().searches || []).flatMap(s => s.results).find(r => r.id === id);
    if (!result) throw new Error('Use a source ID returned by search_opportunities.');
    const existing = this.read().opportunities.find(o => o.source_url === result.url);
    if (existing) return existing;
    return this.importOpportunity({ id: `source-${id}`, source_url: result.url, observed_at: result.observed_at, buyer: result.title.slice(0, 160) || 'Unverified search candidate', need: result.title || 'Inspect source to determine need', evidence: `UNVERIFIED SEARCH SNIPPET — confirm buyer intent and current availability at source: ${result.description || 'No snippet supplied.'}`, next_action: 'Owner: open the source and confirm this is a current paid request before sending any response.' });
  }
  propose(input) {
    const p = proposalSchema.parse(input);
    const cost = cents(p.proposed_cost);
    return this.change(s => {
      this.findOpportunity(s, p.opportunity_id);
      const duplicate = s.experiments.find(e => e.opportunity_id === p.opportunity_id && ['pending_approval', 'approved'].includes(e.status));
      if (duplicate) return { proposal: duplicate, reused: true, effect: 'Planning only; nothing spent.' };
      const today = new Date().toISOString().slice(0, 10);
      const totals = summarize(s, this.config);
      const reservedToday = s.experiments.filter(e => e.created_at.startsWith(today) && ['pending_approval', 'approved'].includes(e.status)).reduce((n, e) => n + e.cost_cents, 0);
      const spentToday = s.entries.filter(e => e.time.startsWith(today) && ['expense', 'fee', 'refund'].includes(e.kind)).reduce((n, e) => n + e.amount_cents, 0);
      const reasons = [];
      if (cost + reservedToday + spentToday > cents(this.config.daily_spend_limit)) reasons.push('Daily planning budget exceeded');
      if (cost + totals.reserved_cents + Math.max(0, -totals.cash_contribution_cents) > cents(this.config.total_loss_limit)) reasons.push('Unrecovered validation budget exceeded');
      if (cost + totals.reserved_cents > totals.balance_cents) reasons.push('Insufficient recorded working capital');
      const row = { ...p, id: randomUUID(), cost_cents: cost, created_at: new Date().toISOString(), status: reasons.length ? 'rejected_by_budget' : 'pending_approval', reasons };
      s.experiments.push(row);
      this.log(s, `Proposal ${row.id}: ${row.status}`);
      return { proposal: row, effect: 'Planning only; no payment or external action occurred.' };
    });
  }
  review(id, decision) {
    z.enum(['approved', 'rejected', 'completed']).parse(decision);
    return this.change(s => {
      const row = s.experiments.find(e => e.id === id);
      if (!row) throw new Error('Unknown proposal ID.');
      const from = decision === 'completed' ? 'approved' : 'pending_approval';
      if (row.status !== from) throw new Error(`Cannot mark ${row.status} proposal ${decision}.`);
      row.status = decision;
      this.log(s, `Owner marked proposal ${id} ${decision}; no payment executed`);
      return row;
    });
  }
  draft(input) {
    const p = draftSchema.parse(input);
    return this.change(s => {
      this.findOpportunity(s, p.opportunity_id);
      let row = s.drafts.find(e => e.opportunity_id === p.opportunity_id && e.kind === p.kind);
      if (row?.content === p.content) return row;
      if (!row) { row = { id: randomUUID() }; s.drafts.push(row); }
      Object.assign(row, p, { updated_at: new Date().toISOString(), status: 'draft_only' });
      this.log(s, `Saved ${p.kind} draft for ${p.opportunity_id}; not sent`);
      return row;
    });
  }
  record(input) {
    const p = entrySchema.parse(input);
    const amount = cents(p.amount);
    if (p.kind === 'owner_time' ? amount !== 0 || p.minutes === 0 : amount === 0 || p.minutes !== 0) throw new Error('Cash entries need a positive amount and no minutes; owner_time needs positive minutes and no amount.');
    return this.change(s => {
      if (p.opportunity_id) this.findOpportunity(s, p.opportunity_id);
      const row = { ...p, amount_cents: amount };
      const old = s.entries.find(e => e.reference === p.reference);
      if (old) {
        if (Object.entries(row).every(([key, value]) => old[key] === value)) return old;
        throw new Error('Reference already recorded with different data. Do not reuse a receipt reference.');
      }
      Object.assign(row, { id: randomUUID(), time: new Date().toISOString() });
      s.entries.push(row);
      this.log(s, `Owner recorded ${p.kind}: ${p.reference}`);
      return row;
    });
  }
  startRun(key) {
    return this.change(s => {
      const active = s.runs.find(r => r.status === 'running' && Date.now() - Date.parse(r.started_at) < (this.config.run_timeout_seconds + 60) * 1000);
      if (active) throw new Error('Another agent run is active; wait for it to finish.');
      for (const r of s.runs.filter(r => r.status === 'running')) { r.status = 'interrupted'; r.error = 'Previous process did not finish.'; }
      if (s.runs.some(r => r.key === key && ['completed', 'waiting_for_input'].includes(r.status))) return null;
      const row = { id: randomUUID(), key, started_at: new Date().toISOString(), status: 'running', report: '', calls: 0 };
      s.runs.push(row);
      return row;
    });
  }
  finishRun(id, result) {
    return this.change(s => {
      const row = s.runs.find(r => r.id === id);
      if (!row) throw new Error('Unknown run ID.');
      Object.assign(row, result, { finished_at: new Date().toISOString() });
      this.log(s, `Run ${row.status}: ${row.key}`);
      return row;
    });
  }
}
