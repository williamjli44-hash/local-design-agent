# Local Design Agent

This is the smallest example of a local model using an MCP server.

The local DeepSeek model is the reasoning engine. The MCP server exposes one tool:

```text
get_design_spec(component_name)
```

The tool reads `designs.json` and returns design tokens. The agent gives those tokens to the model, which can then produce matching React code.

## Setup

1. Install Node.js and Ollama.
2. Pull a local model that supports tool calling. The default is `deepseek-r1:8b`, but you can choose another model with `OLLAMA_MODEL`. The model must fit in your available GPU/system memory.
3. Install the JavaScript dependencies:

```bash
npm install
```

4. Start the chat:

```bash
npm run chat
```

To use a different model:

```bash
OLLAMA_MODEL=your-model-name npm run chat
```

5. Try:

```text
Create a React primary button using the design library.
```

Then try:

```text
Create a React card using the design library.
```

## What to observe

When the model needs visual details, the agent prints:

```text
Calling MCP tool: get_design_spec
```

That is the important moment: DeepSeek requested a tool, the agent called the MCP server, and the result was sent back to DeepSeek.

## Inspect the MCP server directly

You can test the server without DeepSeek:

```bash
npm run inspect
```

This starts MCP Inspector, where you can see and manually call the available tool.

## Next step

After this makes sense, replace `design-mcp-server.mjs` with Figma's MCP server. The agent loop stays conceptually the same; only the source of the design information changes.
