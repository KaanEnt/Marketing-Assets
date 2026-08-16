import "server-only";

import type { GenerateContentResponse } from "@google/genai";

import { firstInlineImage, getClient, noImageReason, type GeneratedImage } from "@/lib/images/client";

// Nano Banana Pro. Chosen over the flash tier for one reason: this app edits the user's
// own photographs, where a drifted product label or a drifted face is a defect rather
// than a variation. It costs roughly twice the latency, so paths that do not touch a
// real subject stay free to override it.
export const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL || "gemini-3-pro-image";

export { isImageGenConfigured } from "@/lib/images/client";
export type { GeneratedImage } from "@/lib/images/client";

export type SlotKind = "image" | "illustration";

export type GenerateOptions = {
  prompt: string;
  kind: SlotKind;
  /** Design palette, injected so art lands in-palette rather than needing recolour. */
  palette?: string[];
  /** Locked on the first illustration of a project so later art matches it. */
  style?: string;
  /** Guides composition: a tall crop and a wide crop want different framing. */
  aspect?: number;
  signal?: AbortSignal;
};

/**
 * Photography and illustration have opposite requirements, so they get opposite
 * prompts: a photo must fill its mask edge to edge, while illustration must sit
 * on transparency so it can overlap whatever is behind it.
 */
function buildPrompt(options: GenerateOptions): string {
  const parts = [options.prompt.trim()];

  if (options.kind === "illustration") {
    parts.push(
      "Flat vector-style illustration on a fully transparent background.",
      "No background fill, no scenery behind the subject, no drop shadow, no text, no watermark.",
      "Clean shapes, confident silhouette, centred with even margins.",
    );
  } else {
    parts.push(
      "Photographic, natural lighting, sharp focus, editorial quality.",
      "No text, no watermark, no logos, no borders.",
      "Composed so the subject stays readable when cropped.",
    );
  }

  if (options.aspect) {
    parts.push(
      options.aspect > 1.3
        ? "Wide landscape composition."
        : options.aspect < 0.8
          ? "Tall portrait composition."
          : "Roughly square composition.",
    );
  }

  if (options.palette?.length) {
    parts.push(`Colour palette to match: ${options.palette.join(", ")}.`);
  }

  if (options.style) parts.push(options.style);

  return parts.join("\n");
}

export type GenerateResult = {
  image: GeneratedImage | null;
  /** Returned so the caller settles what this cost rather than assuming the happy path. */
  usage?: GenerateContentResponse["usageMetadata"];
};

export async function generateImage(options: GenerateOptions): Promise<GenerateResult> {
  const response = await getClient().models.generateContent({
    model: IMAGE_MODEL,
    contents: buildPrompt(options),
    config: {
      responseModalities: ["IMAGE"],
      ...(options.signal ? { abortSignal: options.signal } : {}),
    },
  });

  const usage = response.usageMetadata;
  const image = firstInlineImage(response);
  if (image) return { image, usage };

  // A successful response with no image means a safety block, recitation, or a
  // text-only reply. Surface why, so a silent null is never read as "no work".
  console.warn(
    `[images] no image for "${options.prompt.slice(0, 60)}" (${noImageReason(response)})`,
  );
  return { image: null, usage };
}
