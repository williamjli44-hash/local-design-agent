import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const designs = JSON.parse(
  await readFile(new URL("./designs.json", import.meta.url), "utf8")
);

const server = new McpServer({
  name: "local-design-library",
  version: "0.1.0"
});

server.registerTool(
  "get_design_spec",
  {
    title: "Get design specification",
    description: "Return the design tokens for a named UI component.",
    inputSchema: {
      component_name: z.string().describe("For example: primary-button or card")
    }
  },
  async ({ component_name }) => {
    const design = designs[component_name];

    if (!design) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown component '${component_name}'. Available components: ${Object.keys(designs).join(", ")}`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ component_name, ...design }, null, 2)
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
