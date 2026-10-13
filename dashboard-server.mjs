import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { Store } from './lib/store.mjs';
import { ROOT } from './lib/config.mjs';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
const rows = (items, render, empty) => items.length ? items.map(render).join('') : `<p class="muted">${escapeHtml(empty)}</p>`;

export function renderDashboard(s, token = '', message = '') {
  const e = escapeHtml;
  const form = (action, fields, label) => `<form method="post" action="/${action}"><input type="hidden" name="csrf" value="${e(token)}">${fields}<button>${e(label)}</button></form>`;
  const hidden = (name, value) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`;
  const field = (name, label, type = 'text', required = true) => `<label>${e(label)}<input name="${e(name)}" type="${type}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="0.01"' : ''}></label>`;
  const select = (name, options) => `<select name="${name}">${options.map(v => `<option value="${e(v)}">${e(v)}</option>`).join('')}</select>`;
  const b = s.financials;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local Business Agent</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{font:15px/1.6 system-ui,sans-serif;color:#172b3a;background:#f3f6f7;margin:0}main{max-width:1120px;margin:auto;padding:36px 24px}h1{font-size:32px;margin:0}h2{font-size:21px;margin:0 0 8px}h3{margin:12px 0 4px}.eyebrow{color:#246558;font-weight:650;letter-spacing:.08em;text-transform:uppercase;font-size:12px}.muted,small{color:#526578}.card{background:#fff;border:1px solid #dbe5e7;padding:22px;border-radius:12px;margin:20px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}small{display:block}strong{display:block;font-size:26px}code{font-size:12px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fa;padding:14px;border-radius:8px;font:14px/1.6 system-ui}article{border-top:1px solid #e2e8ed;padding:14px 0}a{color:#146a5e}summary{cursor:pointer;font-weight:600}.tag{font-size:12px;background:#e9f2ee;padding:3px 7px;border-radius:5px}footer{color:#526578}p{margin:8px 0}form{margin:14px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:end}label{display:block;flex:1;min-width:180px}input,select,textarea{font:inherit;border:1px solid #bac9cf;border-radius:6px;padding:8px;width:100%;background:white;color:#172b3a}textarea{min-height:90px}button{font:inherit;background:#185a4e;color:white;border:0;border-radius:6px;padding:10px 16px;cursor:pointer}.notice{background:#fff3d9;padding:12px;border-radius:6px}.wide{flex-basis:100%}@media(max-width:700px){.metrics{grid-template-columns:1fr 1fr}main{padding:20px 14px}strong{font-size:22px}}</style></head><body><main>
  <div class="eyebrow">Buyer demand → scoped work → delivery → collected profit</div><h1>Local Business Agent</h1><p>Current offer: one mobile website repair for $149. Validate demand with real buyers.</p>${message ? `<p class="notice">${e(message)}</p>` : ''}
  <section class="card"><h2>Business results</h2><p class="muted">${e(b.label)}</p><div class="metrics"><div><small>Collected revenue</small><strong>${money(b.revenue_cents)}</strong></div><div><small>Costs, fees & refunds</small><strong>${money(b.cost_cents)}</strong></div><div><small>Cash contribution</small><strong>${money(b.cash_contribution_cents)}</strong></div><div><small>After owner time</small><strong>${money(b.contribution_after_time_cents)}</strong></div></div><p>Working balance ${money(b.balance_cents)} · Capital ${money(b.capital_cents)} · Owner time ${b.owner_minutes} min · Planning reservations ${money(b.reserved_cents)}</p><p class="muted">Before tax. Owner time valued at ${money(s.policy.owner_hourly_rate * 100)}/hour. Quotes and unpaid invoices are excluded.</p></section>
  <section class="card"><h2>Daily operator</h2>${form('run', '', 'Run daily review')}<p class="muted">Prepares drafts and next actions using imported evidence. Refresh this page to see the result.</p>${rows(s.runs.slice(-1), r => `<p><span class="tag">${e(r.status)}</span> ${e(r.started_at)}</p><pre>${e(r.report || 'Running…')}</pre>`, 'Add one buyer request below, choose your installed model in config.local.json, and run the review.')}</section>
  <section class="card"><h2>Add a buyer request</h2><p>Use a posted paid request, inbound inquiry, or invited agency request. Preserve the evidence.</p>${form('opportunity', field('buyer', 'Buyer / business') + field('source_url', 'Source URL', 'url') + field('need', 'Requested outcome') + '<label class="wide">Evidence / buyer request<textarea name="evidence" required></textarea></label>' + field('next_action', 'Next action'), 'Add opportunity')}</section>
  <section class="card"><h2>Buyer pipeline</h2>${rows(s.opportunities, o => `<article><h3>${e(o.buyer)} <span class="tag">${e(o.status)}</span></h3><code>${e(o.id)}</code><p>${e(o.need)}</p><p><a href="${e(o.source_url)}" target="_blank" rel="noreferrer noopener">Source evidence</a> · Recorded ${e(o.observed_at)}</p><p>${e(o.evidence)}</p><p>Next: ${e(o.next_action)}</p><details><summary>Record progress</summary>${form('stage', hidden('id', o.id) + '<label>Stage' + select('status', ['new', 'contacted', 'replied', 'won', 'delivered', 'lost']) + '</label>' + field('evidence', 'What happened and what is next?'), 'Save stage')}</details></article>`, 'No buyer requests yet.')}</section>
  <section class="card"><h2>Drafts and deliverables</h2>${rows(s.drafts, d => `<article><details><summary>${e(d.kind)} · ${e(d.opportunity_id)}</summary><p>Saved ${e(d.updated_at)} · <a href="/draft/${e(d.id)}">Download text</a> · Not sent or deployed</p><pre>${e(d.content)}</pre></details></article>`, 'The agent can prepare responses, delivery briefs, follow-ups, and draft deliverables.')}</section>
  <section class="card"><h2>Experiments</h2><p class="muted">Planning budget: ${money(s.policy.daily_spend_limit * 100)}/UTC day; ${money(s.policy.total_loss_limit * 100)} unrecovered validation spend. Approving reserves the estimate; it does not send a payment.</p>${rows(s.experiments, x => `<article><h3>${e(x.name)} <span class="tag">${e(x.status)}</span></h3><p>${money(x.cost_cents)} · ${e(x.purpose)}</p><p>Measure: ${e(x.expected_signal)}<br>Stop: ${e(x.stop_condition)}</p>${x.reasons.length ? `<p>${e(x.reasons.join('; '))}</p>` : ''}${x.status === 'pending_approval' ? form('review', hidden('id', x.id) + '<label>Decision' + select('decision', ['approved', 'rejected']) + '</label>', 'Record decision') : ''}${x.status === 'approved' ? form('review', hidden('id', x.id) + hidden('decision', 'completed'), 'Mark complete / release reservation') : ''}</article>`, 'No experiments proposed.')}</section>
  <section class="card"><h2>Record a transaction or owner time</h2><p class="muted">Enter completed transactions. Revenue means collected cash. Capital is your allocated funding. A reference can only be counted once.</p>${form('entry', '<label>Type' + select('kind', ['capital', 'revenue', 'expense', 'fee', 'refund', 'owner_time']) + '</label>' + field('amount', 'Amount (USD; 0 for time)', 'number', false) + field('minutes', 'Minutes (time entries only)', 'number', false) + field('reference', 'Unique receipt / entry reference') + field('note', 'Evidence / description'), 'Record entry')}</section>
  <section class="card"><h2>Recent activity</h2>${rows(s.activity.slice(-20).reverse(), a => `<p><small>${e(a.time)}</small>${e(a.message)}</p>`, 'No activity yet.')}</section>
  <footer>Local workspace · bank connection: none · delivery and customer communication require your connected tools or manual action</footer>
  </main></body></html>`;
}

export function createDashboard(store, { runDaily } = {}) {
  const token = randomUUID();
  return createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); res.end('Local access only'); return; }
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method === 'GET' && req.url?.startsWith('/draft/')) {
        const d = store.read().drafts.find(d => d.id === req.url.slice(7));
        if (!d) { res.writeHead(404); res.end('Draft not found'); return; }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${d.opportunity_id}-${d.kind}.txt"` });
        res.end(d.content); return;
      }
      if (req.method === 'POST') {
        if (req.headers.origin !== `http://${host}` || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) { res.writeHead(403); res.end('Use the local dashboard form.'); return; }
        let body = '';
        for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 32768) throw new Error('Form too large.'); }
        const p = Object.fromEntries(new URLSearchParams(body));
        if (p.csrf !== token) { res.writeHead(403); res.end('Refresh the dashboard and try again.'); return; }
        if (req.url === '/opportunity') store.importOpportunity({ id: `lead-${randomUUID()}`, buyer: p.buyer, source_url: p.source_url, observed_at: new Date().toISOString(), need: p.need, evidence: p.evidence, next_action: p.next_action });
        else if (req.url === '/stage') store.stage(p.id, p.status, p.evidence);
        else if (req.url === '/entry') store.record({ kind: p.kind, amount: Number(p.amount || 0), minutes: Number(p.minutes || 0), reference: p.reference, note: p.note });
        else if (req.url === '/review') store.review(p.id, p.decision);
        else if (req.url === '/run' && runDaily) runDaily();
        else throw new Error('Unknown action.');
        res.writeHead(303, { location: '/' }); res.end(); return;
      }
      if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(renderDashboard(store.snapshot(), token));
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderDashboard(store.snapshot(), token, error.message));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new Store();
  const port = Number(process.env.PORT || 3000);
  let child;
  const server = createDashboard(store, { runDaily: () => {
    if (child) throw new Error('A review is already running.');
    child = spawn(process.execPath, [resolve(ROOT, 'business-agent.mjs'), '--once', '--force'], { cwd: ROOT, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', error => { store.change(s => store.log(s, `Runner startup failed: ${error.message}`)); child = undefined; });
    child.once('exit', () => { child = undefined; });
  } });
  server.on('error', error => { console.error(`Dashboard: ${error.message}`); store.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Business dashboard: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child?.kill(); server.close(() => { store.close(); process.exit(0); }); });
}
