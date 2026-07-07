import "server-only";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type {
  AnyZodRawShape,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";

// Drop-in replacement for the SDK's `tool()` that times the handler's execution
// and logs it as a one-liner. It deliberately measures ONLY the tool's own run
// — the pure in-memory / DB / fs work — NOT the model's time to generate the
// call (that "input" window is logged separately in the agent route). Aliased as
// `tool` at each import site, so no call site changes.
//
// Why this matters: a tool row looks slow in the UI mostly because the model is
// streaming the tool's arguments token-by-token, not because the handler is
// slow. This split lets the server log prove where the time actually goes
// (e.g. get_icons exec ~0ms vs. a multi-second input window).
export function timedTool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: SdkMcpToolDefinition<Schema>["handler"],
): SdkMcpToolDefinition<Schema> {
  return tool(name, description, inputSchema, async (args, extra) => {
    const start = Date.now();
    try {
      return await handler(args, extra);
    } finally {
      console.log(`[agent] tool ${name} exec ${Date.now() - start}ms`);
    }
  });
}
