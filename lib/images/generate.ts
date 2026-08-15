import "server-only";

import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash-image";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI | null {
  const key = apiKey();
  if (!key) return null;
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

export function isImageGenConfigured(): boolean {
  return Boolean(apiKey());
}

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

export type GeneratedImage = { dataUri: string; mimeType: string };

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

export async function generateImage(options: GenerateOptions): Promise<GeneratedImage | null> {
  const ai = getClient();
  if (!ai) throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set");

  const model = process.env.IMAGE_GEN_MODEL || DEFAULT_MODEL;
  const response = await ai.models.generateContent({
    model,
    contents: buildPrompt(options),
    config: {
      responseModalities: ["IMAGE"],
      ...(options.signal ? { abortSignal: options.signal } : {}),
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (inline?.data) {
      const mimeType = inline.mimeType || "image/png";
      return { dataUri: `data:${mimeType};base64,${inline.data}`, mimeType };
    }
  }

  // A successful response with no image means a safety block, recitation, or a
  // text-only reply. Surface why, so a silent null is never read as "no work".
  console.warn(
    `[images] no image for "${options.prompt.slice(0, 60)}" (finish=${
      response.candidates?.[0]?.finishReason ?? "none"
    })`,
  );
  return null;
}
