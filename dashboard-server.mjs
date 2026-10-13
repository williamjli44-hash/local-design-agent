import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const dataUrl = (name) => new URL(`./data/${name}`, import.meta.url);
const readJson = (name) => readFile(dataUrl(name), "utf8").then(JSON.parse);

const html = (account, experiments, activity) => `<!doctype html><html><head><meta charset="utf-8"><title>Local Business Agent</title><style>body{font:16px system-ui;margin:40px;max-width:1000px;background:#f6f7fb;color:#18202a}h1{margin-bottom:4px}.muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{background:white;border:1px solid #e4e7ec;border-radius:12px;padding:18px;margin:16px 0;box-shadow:0 2px 8px #0000000a}.metric{font-size:28px;font-weight:700}.ok{color:#087443}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #eaecf0}code{background:#eef2f6;padding:2px 5px;border-radius:4px}</style></head><body><h1>Local Business Agent</h1><div class="muted">Simulation mode · real bank access disabled</div><div class="grid"><div class="card"><div class="muted">Balance</div><div class="metric">$${account.balance.toFixed(2)}</div></div><div class="card"><div class="muted">Spent</div><div class="metric">$${account.spent.toFixed(2)}</div></div><div class="card"><div class="muted">Revenue</div><div class="metric">$${account.revenue.toFixed(2)}</div></div><div class="card"><div class="muted">Bank access</div><div class="metric ok">${account.bank_access}</div></div></div><div class="card"><h2>Experiments</h2>${experiments.length ? `<table><tr><th>Name</th><th>Cost</th><th>Status</th><th>Purpose</th></tr>${experiments.map((e) => `<tr><td>${e.name}</td><td>$${Number(e.proposed_cost).toFixed(2)}</td><td>${e.status}</td><td>${e.purpose}</td></tr>`).join("")}</table>` : "<p>No experiment proposals yet.</p>"}</div><div class="card"><h2>Activity</h2><ul>${activity.slice().reverse().map((item) => `<li><code>${item.time}</code> — ${item.message}</li>`).join("")}</ul></div><div class="card"><h2>Next step</h2><p>Run <code>npm run chat</code> and ask the agent to propose a conservative experiment under $10.</p></div></body></html>`;

createServer(async (req, res) => {
  if (req.url !== "/") { res.writeHead(404); res.end("Not found"); return; }
  try {
    const [account, experiments, activity] = await Promise.all([readJson("account.json"), readJson("experiments.json"), readJson("activity.json")]);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html(account, experiments, activity));
  } catch (error) { res.writeHead(500); res.end(String(error)); }
}).listen(3000, "127.0.0.1", () => console.log("Dashboard running at http://localhost:3000"));
