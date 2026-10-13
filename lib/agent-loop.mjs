import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './config.mjs';

export async function loadInstructions() {
  const [operator, strategy] = await Promise.all([
    readFile(resolve(ROOT, 'instructions/operator.md'), 'utf8'),
    readFile(resolve(ROOT, 'STRATEGY.md'), 'utf8')
  ]);
  return `${operator}\n\n${strategy}`;
}

export async function runAgent({ prompt, instructions, tools, chat, callTool, config, onCall = () => {} }) {
  const messages = [{ role: 'system', content: instructions }, { role: 'user', content: prompt }];
  const allowed = new Set(tools.map(t => t.name));
  const exposed = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  let calls = 0;
  const trace = [];
  for (let turn = 0; turn < config.max_turns; turn++) {
    // Character count is a conservative heuristic, not an exact token count.
    // Stop explicitly instead of relying on silent model context truncation.
    if (JSON.stringify({ messages, exposed }).length > (config.context_length - config.max_output_tokens) * 3) {
      return { status: 'limited', report: 'Context budget reached. Saved work is intact. Narrow the next request or increase context_length for your hardware.', calls, trace };
    }
    const response = await chat({ model: config.model, messages, tools: exposed, stream: false, options: { temperature: 0.2, num_ctx: config.context_length, num_predict: config.max_output_tokens } });
    if (response.done_reason === 'length') return { status: 'limited', report: 'Model output limit reached. Increase max_output_tokens or use a more concise tool-capable model; no incomplete tool call was executed.', calls, trace };
    const message = response.message;
    if (!message || message.role !== 'assistant') throw new Error('Invalid assistant response from the selected model.');
    messages.push(message);
    if (!message.tool_calls?.length) {
      if (!message.content?.trim()) throw new Error('Model returned an empty answer. Check model/tool compatibility and token limits.');
      return { status: 'completed', report: message.content, calls, trace };
    }
    for (const call of message.tool_calls) {
      if (calls >= config.max_tool_calls) return { status: 'limited', report: 'Tool-call limit reached. Review saved work before retrying.', calls, trace };
      calls++;
      const name = call.function?.name;
      let result;
      try {
        if (!allowed.has(name)) throw new Error(`Tool unavailable: ${name}`);
        result = await callTool({ name, arguments: call.function.arguments });
      } catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
      const content = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
      trace.push({ tool: name || 'invalid', error: Boolean(result.isError) });
      onCall(name, result.isError);
      messages.push({ role: 'tool', tool_name: name || 'invalid', content: JSON.stringify({ isError: Boolean(result.isError), result: content }) });
    }
  }
  return { status: 'limited', report: 'Turn limit reached. Saved drafts remain available; no further calls executed.', calls, trace };
}
