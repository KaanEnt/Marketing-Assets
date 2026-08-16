import { CursorAgentError } from "@cursor/sdk";
import { guard } from "@kaanent/limiter/next";
import { readCursorUsd } from "@kaanent/limiter/cursor";

import { limiter } from "@/lib/limits";
import { resumeOrCreate, runTurn, type AgentHandle } from "@/lib/ai/agent";
import { composePrompt, correctionPrompt } from "@/lib/ai/prompts/compose";
import { closeSseController, createSseSender, sseHeaders } from "@/lib/ai/sse";
import { DEFAULT_MODEL, rescueModelFor } from "@/lib/ai/models";
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

// The rescue is the most expensive single decision this route makes, so it is a
// lever rather than a fixed behaviour. On by default, because turning it off
// changes what the product does rather than what it costs.
const RESCUE_ENABLED = process.env.ASSETS_RESCUE_ENABLED !== "false";

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

  const gate = await guard(request, limiter, { operation: "design.generate" });
  if (!gate.ok) return gate.response;

  const preset = getPreset(payload.presetId ?? "") ?? PRESETS[DEFAULT_PRESET];
  const requested = payload.model?.trim();
  const primary = requested || DEFAULT_MODEL;
  // A model the user picked by hand is respected as picked; escalating behind
  // their back would make the picker a suggestion.
  //
  // The budget vetoes it too. A rescue is three more turns on a model costing
  // five times as much per token, which is the single most expensive thing this
  // route can decide to do, and the point of degrading is to stop deciding it
  // while there is still budget left for ordinary work.
  const rescue = requested || gate.degraded || !RESCUE_ENABLED ? null : rescueModelFor(primary);
  const assets = payload.assets ?? [];
  const assetIds = assets.map((asset) => asset.id);

  let agent: AgentHandle | undefined;
  let closed = false;

  /**
   * Summed rather than settled per agent: a rescued turn spans two agents and one
   * reservation, and settling twice would let the second overwrite the first.
   * Null stays null, so a cost that never lands upstream leaves the estimate in
   * place instead of quietly zeroing the turn.
   */
  let spentUsd: number | null = null;

  const bank = async (used: AgentHandle) => {
    const usd = await readCursorUsd(used, {
      onUnsettled: (reason) => console.warn(`[limits] design.generate unsettled: ${reason}`),
    });
    if (usd !== null) spentUsd = (spentUsd ?? 0) + usd;
  };

  const release = async (used: AgentHandle | undefined) => {
    if (!used) return;
    // Usage is read before disposal, because a disposed agent has nothing to ask.
    await bank(used);
    await used[Symbol.asyncDispose]().catch(() => {});
  };

  const close = async () => {
    if (spentUsd === null) return;
    await gate.settle(spentUsd);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = createSseSender(controller, () => closed);

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

      /**
       * One model's full attempt: compose, then spend its correction rounds.
       * Returns null when it never satisfied the contract, which is the signal to
       * escalate rather than to fail.
       */
      const attempt = async (model: string, resumeId: string | undefined) => {
        const resumed = await resumeOrCreate(resumeId, model, message);
        agent = resumed.agent;
        send("agent", { agentId: agent.agentId, resumed: !resumed.isNew, model });

        let turn = await runTurn(agent, prompt, model, (text) => send("token", { text }));
        if (turn.status === "error") return null;

        let svg = extractSvg(turn.text);
        let result = svg ? validateSvg(svg, preset, assetIds) : null;

        for (let round = 0; round < MAX_CORRECTIONS; round += 1) {
          if (svg && result?.ok) break;

          const problem = svg
            ? formatViolations(result!.violations)
            : "- No SVG document was found in the reply. Return one fenced ```svg block.";

          send("correcting", { attempt: round + 1, violations: problem, model });

          turn = await runTurn(agent, correctionPrompt(problem), model);
          if (turn.status === "error") break;

          svg = extractSvg(turn.text);
          result = svg ? validateSvg(svg, preset, assetIds) : null;
        }

        if (!svg || !result?.ok) {
          return { failed: true as const, violations: result ? formatViolations(result.violations) : undefined };
        }

        return { failed: false as const, svg, groupIds: result.groupIds, note: stripSvg(turn.text), status: turn.status, model };
      };

      try {
        let outcome = await attempt(primary, payload.agentId);

        if ((!outcome || outcome.failed) && rescue) {
          send("rescuing", { from: primary, to: rescue, violations: outcome?.violations });
          // Dispose the exhausted agent before starting a clean one, so two live
          // agents are never billed against the same turn.
          await release(agent);
          agent = undefined;
          outcome = await attempt(rescue, undefined);
        }

        if (!outcome || outcome.failed) {
          send("error", {
            message: "The agent could not produce a document satisfying the contract.",
            violations: outcome?.violations,
          });
          return;
        }

        send("document", {
          svg: outcome.svg,
          presetId: preset.id,
          layerIds: outcome.groupIds,
          note: outcome.note,
          model: outcome.model,
        });
        send("done", { status: outcome.status, model: outcome.model });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Unknown generation error",
          kind: error instanceof CursorAgentError ? "cursor-agent" : "unknown",
        });
      } finally {
        await release(agent);
        await close();
        closed = true;
        closeSseController(controller);
      }
    },
    // An abandoned turn is still a billed turn: the agent ran until the browser
    // went away. Settling on cancel is what stops a user who reloads repeatedly
    // from generating unmetered work.
    async cancel() {
      closed = true;
      await release(agent);
      await close();
    },
  });

  return gate.decorate(new Response(stream, { headers: sseHeaders }));
}
