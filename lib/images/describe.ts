import "server-only";

import type { GenerateContentResponse } from "@google/genai";

import { getClient, inlinePart } from "@/lib/images/client";

// A cheap vision model, not the image model: this is one sentence of prose and paying
// image-generation rates for it on every import would be absurd.
export const DESCRIBE_MODEL = process.env.IMAGE_DESCRIBE_MODEL || "gemini-3.5-flash-lite";

const INSTRUCTION = `Describe this image for a graphic designer who will place it in a
marketing layout but cannot see it. One sentence, under 25 words. Name the subject
concretely, including any text visible on it. State whether the background is a plain
studio backdrop, a real scene, or transparent. No preamble.`;

export type Description = {
  description: string;
  /** Returned so the caller can settle what this actually cost rather than estimate it. */
  usage?: GenerateContentResponse["usageMetadata"];
};

/**
 * The design agent composes around imported images it never sees, so a filename is not
 * enough: "IMG_4821" produces a layout for nothing in particular, while "a white pump
 * bottle labelled PURE on a studio backdrop" produces one built around the product.
 */
export async function describeImage(dataUri: string, signal?: AbortSignal): Promise<Description> {
  const response = await getClient().models.generateContent({
    model: DESCRIBE_MODEL,
    contents: [{ role: "user", parts: [inlinePart(dataUri), { text: INSTRUCTION }] }],
    config: signal ? { abortSignal: signal } : {},
  });

  return {
    description: (response.text ?? "").trim().replace(/\s+/g, " "),
    usage: response.usageMetadata,
  };
}
