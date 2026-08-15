import "server-only";

import { Agent, AgentBusyError } from "@cursor/sdk";

import { assistantTextDelta } from "@/lib/ai/sse";

// env.type "cloud" with no name pins the default Cursor-managed cloud environment so
// an account-level self-hosted-pool default cannot hijack our repo-less agents.
const CLOUD = { env: { type: "cloud" } } as const;

// A turn may land while the previous one is still releasing the agent (409). Wait it
// out rather than starting fresh, since a new agent loses conversation memory.
const BUSY_BACKOFF_MS = [1500, 2500, 4000, 6000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type AgentHandle = Awaited<ReturnType<typeof Agent.create>>;

export function agentName(seed: string): string {
  const clean = seed.replace(/\s+/g, " ").trim();
  if (!clean) return "Asset design";
  const short = clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
  return `Assets · ${short}`;
}

export async function createAgent(model: string, seed: string): Promise<AgentHandle> {
  return Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: model },
    cloud: CLOUD,
    name: agentName(seed),
  });
}

/** Resume the project's agent so revisions carry context; fall back to a fresh one. */
export async function resumeOrCreate(
  agentId: string | undefined,
  model: string,
  seed: string,
): Promise<{ agent: AgentHandle; isNew: boolean }> {
  if (agentId) {
    try {
      const agent = await Agent.resume(agentId, {
        apiKey: process.env.CURSOR_API_KEY,
        model: { id: model },
      });
      return { agent, isNew: false };
    } catch {
      // Expired or deleted upstream. Rebind to a new one rather than failing the turn.
    }
  }

  return { agent: await createAgent(model, seed), isNew: true };
}

export type TurnResult = {
  text: string;
  status: string;
};

/**
 * Send one prompt and drain the stream. onToken fires per text delta so the caller
 * can forward progress; the accumulated text is returned for parsing.
 */
export async function runTurn(
  agent: AgentHandle,
  prompt: string,
  model: string,
  onToken?: (text: string) => void,
): Promise<TurnResult> {
  const options = { model: { id: model } };
  let run: Awaited<ReturnType<AgentHandle["send"]>> | undefined;

  for (let attempt = 0; ; attempt += 1) {
    try {
      run = await agent.send(prompt, options);
      break;
    } catch (error) {
      const delay = BUSY_BACKOFF_MS[attempt];
      if (!(error instanceof AgentBusyError) || delay === undefined) throw error;
      await sleep(delay);
    }
  }

  let text = "";

  if (run.supports("stream")) {
    for await (const event of run.stream()) {
      if (event.type !== "assistant") continue;
      const delta = assistantTextDelta(event);
      if (!delta) continue;
      text += delta;
      onToken?.(delta);
    }
  }

  const result = await run.wait();
  const final = text || (typeof result.result === "string" ? result.result : "");

  return { text: final, status: result.status };
}
