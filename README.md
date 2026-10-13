# Local Business Agent

A local AI operator for running a focused service business: discover potential buyers, prepare scoped offers and delivery briefs, and track collected profit. The starting offer is a **$149 mobile website repair** for one concrete issue on one page.

Read [STRATEGY.md](STRATEGY.md) for acquisition, qualification, pricing tests, daily priorities, delivery criteria, and stop/pivot decisions. [OFFER.md](OFFER.md) contains the prepared service listing. The runtime loads the strategy and [operator instructions](instructions/operator.md) on every run. [AGENTS.md](AGENTS.md) directs coding assistants continuing this project.

## Start on your PC

Install Git, **Node.js 24 or newer**, and Ollama. Then, in PowerShell or a terminal:

```sh
git clone https://github.com/williamjli44-hash/local-business-agent.git
cd local-business-agent
npm ci
npm test
```

Start Ollama's desktop app, or run `ollama serve` in a separate terminal. Install a model that fits your PC:

```sh
ollama pull deepseek-r1:8b
npm run doctor
npm start
```

Open <http://127.0.0.1:3000>. Choose a different installed local model in an ignored `config.local.json` if needed:

```json
{ "model": "your-installed-model", "owner_hourly_rate": 25 }
```

Model names alone do not prove compatibility. `doctor` checks your installed model's reported tool capability. Actual behavior, speed, and GPU fit must be tested on your machine; a metadata check does not prove the quality of its decisions. The app does not download models automatically.

## Connect the inputs

For live research, copy `.env.example` to `.env` and set your own `BRAVE_SEARCH_API_KEY`. Obtain the key from [Brave Search API](https://api-dashboard.search.brave.com/). The provider may charge for requests; choose your plan and record those costs in the dashboard. Do not commit the key. Restart the dashboard after changing `.env`.

The search tool uses Brave's documented [web search endpoint](https://api-dashboard.search.brave.com/documentation/services/web-search), retrieves at most five results per query, caches repeated queries for the UTC day, and defaults to three requests per day. A result is an **unverified candidate** until the original request is checked. It does not imply that the job is still open or that a buyer will pay us.

You can also add a posted paid request or inbound inquiry directly in the dashboard. Include its source URL, actual request, and next action. Research and manual intake both produce persistent, source-linked records.

The repo cannot supply your marketplace identity, customer relationships, or payment account. Use your chosen platform to publish the offer, send reviewed responses, agree terms, and collect payment. Those external accounts are not connected in this release.

## Daily operation

1. Add a buyer request or configure web research.
2. Click **Run daily review**. Refresh the page for the result. The agent researches when configured, qualifies candidates, saves response/delivery/follow-up drafts, and recommends one next action.
3. Review/download the drafts. Check the source and send selected offers through the permitted channel. Record the customer stage in the dashboard.
4. Perform and verify the agreed repair in the customer's authorized code workspace. The agent can draft a delivery brief or supplied-code deliverable, but it has no customer repository executor or deployment access.
5. Record collected receipts, expenses, fees, refunds, and all owner time. Inspect contribution after time before repeating the offer.

The initial ledger is empty: the app does not invent $200, customers, or sales. Record your $200 allocation as **capital** when actually allocated. Capital, quotes, unpaid invoices, and opportunity values do not count as revenue. Financial entries are owner bookkeeping, not a verified bank feed. Taxes are not calculated.

The dashboard also records experiment approvals/rejections. Approving an experiment reserves its planned cost; it does not execute a payment. On completion, record actual costs separately and mark the experiment complete to release the reservation. Planning uses cumulative daily and unrecovered-loss limits, not only a per-proposal check.

## Schedule on Windows

First verify a manual daily run:

```sh
npm run daily
```

Then configure Task Scheduler:

- Trigger: daily at your chosen time.
- Program: the full path returned by `where.exe node`.
- Arguments: `"C:\your-folder\local-business-agent\business-agent.mjs" --once`.
- Start in: `C:\your-folder\local-business-agent`.
- Use your normal Windows account and "Do not start a new instance." Ollama must be running for that account. Configure waking the PC if appropriate.

The command completes a bounded run and exits. Successful/waiting daily runs are deduplicated by UTC date. Use `npm run daily -- --force` after adding new evidence on the same day; the dashboard button does this for manual requests. Failed/limited runs can retry. An active run blocks overlap; after a crash the lock expires at the configured run timeout plus one minute. If there are no leads and no search key, it records the missing input and exits without inference.

Do not run the model continuously just to create activity. Customer replies, new evidence, and delivery commitments determine what is worth doing next.

## Configuration and storage

`config.local.json` overrides [config.example.json](config.example.json). It supports the model, $20 daily/$50 unrecovered planning limits, $25/hour owner-time value, request/run timeouts, context length, call limits, and daily search request limit. These are initial choices to review against actual economics. `OLLAMA_MODEL` overrides the model, and `OLLAMA_HOST` must point to a local Ollama instance.

Persistent data is in ignored `runtime/business.sqlite`. Set `BUSINESS_DATA_DIR` to another directory if desired. SQLite transactions protect concurrent dashboard/agent updates. Receipts use integer cents and unique references. Same-reference retries do not double count; conflicts are rejected. Keep one scheduled task per data directory. Back up `runtime/` with the app stopped.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Dashboard with lead intake, review, and accounting forms |
| `npm run doctor` | Check instructions, MCP, and installed model metadata |
| `npm run daily` | Run and persist one daily brief |
| `npm run chat -- --prompt "Review current delivery priorities"` | One custom agent request |
| `npm run chat` | Interactive requests; type `exit` to stop |
| `npm run operator -- status` | Financial totals and last run |
| `npm run operator -- export` | Print all local business state for backup/review |
| `npm run inspect` | MCP Inspector; may download the Inspector package |
| `npm test` | Accounting, budgets, sourcing, runner, MCP, and dashboard tests |

Advanced owner commands: `import FILE` validates/imports an opportunity; `record FILE` records a receipt or time entry; `stage ID STATUS "evidence and next action"` updates a customer stage; `review ID approved/rejected/completed` records an experiment decision. Prefer the dashboard for daily use. Schemas are in `lib/store.mjs`.

## Architecture and release boundaries

```text
STRATEGY.md + operator instructions
                 ↓
Daily runner ↔ local Ollama model
       ↓ MCP tools
Research → source-linked candidates → offer/delivery drafts
       ↓
SQLite ← owner decisions, customer stages, receipts, time
       ↓
Local dashboard → next action and contribution after costs
```

Research requires your key. Sending offers, executing customer code, deploying repairs, collecting money, and bank reconciliation require your accounts and work outside this application. No live revenue or conversion rate has been validated. The prepared offer is a business hypothesis to execute, measure, and revise.

Tests exercise the real MCP subprocess and HTTP dashboard with deterministic model/provider substitutes. They validate plumbing, not profitability or your PC's LLM quality. The dashboard binds to loopback and is intended for one owner, not public hosting. The database holds a whole state document; this is not a high-volume CRM or accounting replacement. Corrections/reversals need a reviewed workflow before accounting reliance.

The old design tutorial, simulated balances, and sample business records were removed. Git history preserves them. Existing clones can use `git pull` followed by `npm ci`; ignored runtime data and local settings survive updates. See [REVIEW.md](REVIEW.md) for the code review and remaining work.
