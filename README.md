# Local Business Agent

This is a safe, local starter kit for learning how a local LLM, an agent loop, MCP tools, and a dashboard fit together.

It starts in **simulation mode** with a fake $200 account. The agent can read the simulated account, review experiments, and create experiment proposals. It cannot access a real bank account, spend money, send messages, or publish anything.

## Architecture

```text
Ollama + local model
        ↓
business-agent.mjs
        ↓
business-mcp-server.mjs
        ├─ account overview (simulation)
        ├─ experiment list
        └─ create proposal (simulation only)
        ↓
data/*.json
        ↓
dashboard-server.mjs → http://localhost:3000
```

The original design-to-code lesson is still included. Run `npm run design-chat` to use the earlier `get_design_spec` MCP example.

## Setup on your PC

```bash
git clone https://github.com/williamjli44-hash/local-business-agent.git
cd local-business-agent
npm install
```

Start Ollama in another terminal:

```bash
ollama serve
```

Pull a tool-calling-capable local model. The default model is configurable:

```bash
ollama pull deepseek-r1:8b
```

Start the dashboard:

```bash
npm run dashboard
```

Open <http://localhost:3000>.

In another terminal, start the agent:

```bash
npm run chat
```

Try:

```text
Review my current account and propose one conservative experiment that costs no more than $10.
```

The agent should call MCP tools, but it should only create a proposal. It does not spend money.

To use a different Ollama model:

```bash
OLLAMA_MODEL=your-model-name npm run chat
```

## Safety boundary

The real-money plumbing is intentionally not implemented. There is no bank credential, payment tool, transfer tool, trading tool, email sender, or autonomous publisher in this starter.

The intended progression is:

1. Simulation: fake $200 and fake experiments.
2. Read-only integrations: real metrics and account balances.
3. Human-approved actions: every external action creates an approval request.
4. Only after careful testing: narrowly scoped automation with explicit budgets.

Do not put bank credentials in prompts, JSON files, MCP configuration, or source code.

## Useful commands

```bash
npm run dashboard   # Open the local dashboard
npm run chat        # Start the business-agent loop
npm run design-chat # Run the original design-to-code example
npm run inspect     # Inspect the business MCP server directly
```

## What to build next

- Add a dashboard button that marks a proposal approved or rejected.
- Add a fake expense/revenue tool for simulation.
- Add a read-only analytics connector.
- Add a real integration only after the simulation is understandable and the approval flow is tested.
