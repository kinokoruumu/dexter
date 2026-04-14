import { Agent } from '../agent/agent.js';
import type { AgentEvent } from '../agent/types.js';

const DEFAULT_API_MODEL = 'claude-sonnet-4-20250514';

type RunAgentOptions = {
  model?: string;
  maxIterations?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
};

/**
 * Run the dexter agent loop for a single query and return the final answer.
 * Stateless — no session history or memory persistence.
 */
export async function runAgent(
  query: string,
  options: RunAgentOptions = {},
): Promise<string> {
  const agent = await Agent.create({
    model: options.model ?? DEFAULT_API_MODEL,
    maxIterations: options.maxIterations ?? 10,
    signal: options.signal,
    channel: 'api',
    memoryEnabled: false,
  });

  let finalAnswer = '';

  for await (const event of agent.run(query)) {
    options.onEvent?.(event);
    if (event.type === 'done') {
      finalAnswer = event.answer;
    }
  }

  return finalAnswer;
}
