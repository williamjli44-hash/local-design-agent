# Review of the original money-making prototype

Reviewed starting commit `dc06eac`. The repository was a working MCP teaching example, not an autonomous revenue business. The main bottleneck was lack of a buyer, offer, and feedback loop.

| Original finding | Consequence | Change |
| --- | --- | --- |
| Generic "propose experiments" system prompt | Activity could continue without evidence of paying demand | Specific $149 offer, qualification criteria, delivery checks, and stop/pivot gates in STRATEGY.md; files loaded by the runtime |
| Interactive loop only | No unattended daily run or durable brief | Bounded `daily` command, persisted runs, same-day deduplication, overlap protection, explicit errors/limits |
| No opportunity or draft records | No path from an idea to an owner-reviewed sales conversation | Owner-imported evidence, stages, draft upserts, and next-action tracking |
| Fake balance was static; config was unused | No way to evaluate profit or even apply documented limits | Empty real bookkeeping ledger, validated config, cents and unique receipt references |
| Per-proposal cost check only | Multiple proposals could each fit the limit while exceeding the total | Aggregate pending/approved reservations, daily planned costs, recorded costs, and loss/capital checks |
| MCP response told user to approve in the dashboard, but there were no controls | A misleading dead end | Working owner review forms and CLI; approval explicitly means planning only |
| Dashboard directly interpolated model-generated strings into HTML | Model/customer text could execute as markup | Escaped text, restrictive content policy, loopback binding and host checks |
| Concurrent read-modify-write JSON files | Lost updates and partially written files were possible | SQLite transaction over persistent operational state |
| Default model assumed to support tools; no failure guidance | Machine/model incompatibility looked like a broken agent | `doctor`, installed-model capability check, per-request/run limits and clear failed-run records |
| URL `.pathname` used for subprocess paths | Windows paths and spaces were fragile | Filesystem paths resolved from file URLs in the runner connections; obsolete tutorial removed |
| Dependencies specified as `latest` | Fresh installs could differ unexpectedly | Exact direct versions plus lockfile; `npm ci` setup |

## What remains unvalidated or unimplemented

- No paying customer or proven conversion rate. Price, target segment, and effort assumptions must be tested.
- The target PC's LLM quality, speed, context capacity, and GPU fit need a real model run. Mocked tests prove plumbing, not reasoning competence.
- Brave Search integration is implemented but requires the owner's key; its live credentials and results have not been verified here. Search results remain unverified candidates. There is no automatic outreach, customer code execution, production deployment, bank feed, or payment execution.
- No historical automatic backfill or bank reconciliation. Actual entries are manual and append-only; corrections/reversals need a reviewed future workflow before relying on this as accounting software.
- The daily scheduler must be configured on the target PC; it is not installed on this computer by the repository update.
- The dashboard is single-user and local, with host/origin checks and CSRF tokens on owner forms. Do not expose it as a public service without adding authentication and a deployment review.
- Model/customer artifacts are source material. Instructions say to ignore embedded commands; the limited MCP inventory and absence of financial write tools are the actual capability boundary, not the wording of a prompt.

## Next improvements ranked by likely business value

1. Observe one paid request and ship a reviewed repair; measure owner time and actual receipts.
2. Automate reading the channel that produces real qualified leads, preserving source evidence and avoiding duplicate outreach.
3. Add an isolated code/test workspace once the delivery pattern repeats.
4. Reconcile receipts and automate a narrowly defined handoff after the economics and permissions are understood.

Research pages consulted: [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling), [Ollama DeepSeek model listing](https://ollama.com/library/deepseek-r1), [Node SQLite](https://nodejs.org/api/sqlite.html), [Brave web search](https://api-dashboard.search.brave.com/documentation/services/web-search), and [Upwork service packaging](https://support.upwork.com/hc/en-us/articles/360057397533-How-to-create-a-project-in-Project-Catalog). These substantiate integration/service mechanics, not a daily income estimate.
