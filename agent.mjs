import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import ollama from "ollama";

const model = process.env.OLLAMA_MODEL || "deepseek-r1:8b";
const serverPath = new URL("./design-mcp-server.mjs", import.meta.url).pathname;

const mcpClient = new Client({
  name: "local-design-agent",
  version: "0.1.0"
});

const mcpTransport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath]
});

await mcpClient.connect(mcpTransport);
const { tools } = await mcpClient.listTools();

const ollamaTools = tools.map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description || "",
    parameters: tool.inputSchema
  }
}));

const messages = [
  {
    role: "system",
    content:
      "You are a design-to-code assistant. Use get_design_spec when you need visual design details. Explain what you used, then provide clean React code."
  }
];

console.log(`Connected to MCP server with tools: ${tools.map((tool) => tool.name).join(", ")}`);
console.log(`Using Ollama model: ${model}`);
console.log("Type a request, or type 'exit' to quit.\n");

const rl = readline.createInterface({ input, output });

try {
  while (true) {
    const prompt = await rl.question("> ");
    if (!prompt.trim()) continue;
    if (prompt.trim().toLowerCase() === "exit") break;

    messages.push({ role: "user", content: prompt });

    for (let turn = 0; turn < 5; turn += 1) {
      const response = await ollama.chat({
        model,
        messages,
        tools: ollamaTools
      });

      const assistantMessage = response.message;
      messages.push(assistantMessage);

      const calls = assistantMessage.tool_calls || [];
      if (calls.length === 0) {
        console.log(`\n${assistantMessage.content}\n`);
        break;
      }

      for (const call of calls) {
        console.log(`  Calling MCP tool: ${call.function.name}`);
        const result = await mcpClient.callTool({
          name: call.function.name,
          arguments: call.function.arguments
        });

        const content = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");

        messages.push({
          role: "tool",
          tool_name: call.function.name,
          content
        });
      }
    }
  }
} finally {
  rl.close();
  await mcpClient.close();
}
