import { readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const dataUrl = (name) => new URL(`./data/${name}`, import.meta.url);
const readJson = (name) => readFile(dataUrl(name), "utf8").then(JSON.parse);
const writeJson = (name, value) => writeFile(dataUrl(name), `${JSON.stringify(value, null, 2)}\n`);

async function logActivity(message) {
  const current = await readJson("activity.json");
  current.push({ time: new Date().toISOString(), message });
  await writeJson("activity.json", current);
}

const server = new McpServer({ name: "local-business-simulation", version: "0.1.0" });

server.registerTool("get_account_overview", {
  title: "Get simulated account overview",
  description: "Read the fake business account. This tool never touches a real bank.",
  inputSchema: {}
}, async () => ({ content: [{ type: "text", text: JSON.stringify(await readJson("account.json"), null, 2) }] }));

server.registerTool("list_experiments", {
  title: "List experiments",
  description: "Read business experiments and their current outcomes.",
  inputSchema: {}
}, async () => ({ content: [{ type: "text", text: JSON.stringify(await readJson("experiments.json"), null, 2) }] }));

server.registerTool("create_experiment_proposal", {
  title: "Create experiment proposal",
  description: "Create a proposal for human review. It does not spend money or contact anyone.",
  inputSchema: {
    name: z.string().describe("Short experiment name"),
    purpose: z.string().describe("What the experiment is testing"),
    proposed_cost: z.number().nonnegative().describe("Estimated cost in dollars"),
    expected_signal: z.string().describe("What result would count as useful evidence")
  }
}, async ({ name, purpose, proposed_cost, expected_signal }) => {
  const account = await readJson("account.json");
  const experiments = await readJson("experiments.json");
  const proposal = { id: `exp-${Date.now()}`, name, purpose, proposed_cost, expected_signal, status: "pending_approval", created_at: new Date().toISOString() };
  if (proposed_cost > account.daily_spend_limit) proposal.status = "rejected_by_budget";
  experiments.push(proposal);
  await writeJson("experiments.json", experiments);
  await logActivity(`Created experiment proposal: ${name} (${proposal.status})`);
  return { content: [{ type: "text", text: JSON.stringify({ proposal, next_step: proposal.status === "pending_approval" ? "Wait for a human to approve it in the dashboard. No money was spent." : "The proposal exceeded the simulated daily budget and was not approved." }, null, 2) }] };
});

await server.connect(new StdioServerTransport());
