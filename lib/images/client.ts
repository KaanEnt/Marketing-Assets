import "server-only";

import { GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

let client: GoogleGenAI | undefined;

export function getClient(): GoogleGenAI {
  const key = apiKey();
  if (!key) throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set");
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

export function isImageGenConfigured(): boolean {
  return Boolean(apiKey());
}

export type GeneratedImage = { dataUri: string; mimeType: string };

export function firstInlineImage(response: GenerateContentResponse): GeneratedImage | null {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (!inline?.data) continue;

    const mimeType = inline.mimeType || "image/png";
    return { dataUri: `data:${mimeType};base64,${inline.data}`, mimeType };
  }
  return null;
}

/** Why a successful response carried no image: a safety block, recitation, or a text reply. */
export function noImageReason(response: GenerateContentResponse): string {
  const candidate = response.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ")
    .trim();

  const finish = candidate?.finishReason ?? "none";
  return text ? `${finish}: ${text.slice(0, 200)}` : String(finish);
}

/** Split a data URI back into the inline part the API expects. */
export function inlinePart(dataUri: string): Part {
  const match = dataUri.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) throw new Error("Expected a base64 data URI.");

  return { inlineData: { mimeType: match[1], data: match[2] } };
}
