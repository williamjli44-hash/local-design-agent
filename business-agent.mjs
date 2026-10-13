import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import ollama from "ollama";

const model = process.env.OLLAMA_MODEL || "deepseek-r1:8b";
const serverPath = new URL("./business-mcp-server.mjs", import.meta.url).pathname;
const client = new Client({ name: "local-business-agent", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath] }));
const { tools } = await client.listTools();
const ollamaTools = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description || "", parameters: tool.inputSchema } }));
const messages = [{ role: "system", content: "You are a cautious business-experiment assistant. You operate only in simulation mode. Read account and experiment data when useful. You may create proposals, but never claim to have spent money, contacted anyone, or earned revenue. Keep proposals under the stated budget and explain the next human step." }];

console.log(`Connected to business MCP tools: ${tools.map((tool) => tool.name).join(", ")}`);
console.log(`Using Ollama model: ${model}`);
console.log("Simulation mode: no bank, payment, email, or publishing tools are enabled.");
console.log("Type a request, or type 'exit' to quit.\n");

const rl = readline.createInterface({ input, output });
try {
  while (true) {
    const prompt = await rl.question("> ");
    if (!prompt.trim()) continue;
    if (prompt.trim().toLowerCase() === "exit") break;
    messages.push({ role: "user", content: prompt });
    for (let turn = 0; turn < 6; turn += 1) {
      const response = await ollama.chat({ model, messages, tools: ollamaTools });
      const assistantMessage = response.message;
      messages.push(assistantMessage);
      const calls = assistantMessage.tool_calls || [];
      if (calls.length === 0) { console.log(`\n${assistantMessage.content}\n`); break; }
      for (const call of calls) {
        console.log(`  Calling MCP tool: ${call.function.name}`);
        const result = await client.callTool({ name: call.function.name, arguments: call.function.arguments });
        const content = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
        messages.push({ role: "tool", tool_name: call.function.name, content });
      }
    }
  }
} finally { rl.close(); await client.close(); }
