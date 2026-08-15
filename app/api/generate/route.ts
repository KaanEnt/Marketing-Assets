import { CursorAgentError } from "@cursor/sdk";

import { resumeOrCreate, runTurn, type AgentHandle } from "@/lib/ai/agent";
import { composePrompt, correctionPrompt } from "@/lib/ai/prompts/compose";
import { closeSseController, createSseSender, sseHeaders } from "@/lib/ai/sse";
import { DEFAULT_MODEL } from "@/lib/ai/models";
import { extractSvg, stripSvg } from "@/lib/svg/extract";
import { formatViolations, validateSvg } from "@/lib/svg/validate";
import { DEFAULT_PRESET, PRESETS, getPreset } from "@/lib/layout/presets";
import type { AssetSummary } from "@/lib/assets/types";
import type { BrandKit } from "@/lib/brand/kit";

export const runtime = "nodejs";
export const maxDuration = 300;

// Two corrections, then surface the failure. A model that cannot satisfy the contract
// in three attempts will not satisfy it in five, and the user is left waiting.
const MAX_CORRECTIONS = 2;

type GenerateRequest = {
  message?: string;
  presetId?: string;
  model?: string;
  agentId?: string;
  templateId?: string;
  brandKit?: BrandKit;
  currentLayerIds?: string[];
  assets?: AssetSummary[];
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as GenerateRequest;
  const message = payload.message?.trim();

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  if (!process.env.CURSOR_API_KEY) {
    return Response.json(
      { error: "CURSOR_API_KEY is not resolved. Start the dev server via npm run dev." },
      { status: 501 },
    );
  }

  const preset = getPreset(payload.presetId ?? "") ?? PRESETS[DEFAULT_PRESET];
  const model = payload.model?.trim() || DEFAULT_MODEL;
  const assets = payload.assets ?? [];
  const assetIds = assets.map((asset) => asset.id);

  let agent: AgentHandle | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = createSseSender(controller, () => closed);

      try {
        const resumed = await resumeOrCreate(payload.agentId, model, message);
        agent = resumed.agent;
        send("agent", { agentId: agent.agentId, resumed: !resumed.isNew });

        const prompt = [
          composePrompt({
            preset,
            brandKit: payload.brandKit,
            currentLayerIds: payload.currentLayerIds,
            templateId: payload.templateId,
            assets,
          }),
          "",
          "## Brief",
          "",
          message,
        ].join("\n");

        let turn = await runTurn(agent, prompt, model, (text) => send("token", { text }));
        if (turn.status === "error") {
          send("error", { message: "The design agent run failed." });
          return;
        }

        let svg = extractSvg(turn.text);
        let result = svg ? validateSvg(svg, preset, assetIds) : null;

        for (let attempt = 0; attempt < MAX_CORRECTIONS; attempt += 1) {
          if (svg && result?.ok) break;

          const problem = svg
            ? formatViolations(result!.violations)
            : "- No SVG document was found in the reply. Return one fenced ```svg block.";

          send("correcting", { attempt: attempt + 1, violations: problem });

          turn = await runTurn(agent, correctionPrompt(problem), model);
          if (turn.status === "error") break;

          svg = extractSvg(turn.text);
          result = svg ? validateSvg(svg, preset, assetIds) : null;
        }

        if (!svg || !result?.ok) {
          send("error", {
            message: "The agent could not produce a document satisfying the contract.",
            violations: result ? formatViolations(result.violations) : undefined,
          });
          return;
        }

        send("document", {
          svg,
          presetId: preset.id,
          layerIds: result.groupIds,
          note: stripSvg(turn.text),
        });
        send("done", { status: turn.status });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Unknown generation error",
          kind: error instanceof CursorAgentError ? "cursor-agent" : "unknown",
        });
      } finally {
        await agent?.[Symbol.asyncDispose]().catch(() => {});
        closed = true;
        closeSseController(controller);
      }
    },
    async cancel() {
      closed = true;
      await agent?.[Symbol.asyncDispose]().catch(() => {});
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
