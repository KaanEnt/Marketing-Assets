import "server-only";

import { Cursor } from "@cursor/sdk";

export type ModelOption = { id: string; label: string };

// Cursor.models.list() reports base ids (grok-4.6) rather than the effort-suffixed
// variants the raw REST catalog exposes (cursor-grok-4.6-high-fast), so the
// SDK-facing id is the short one.
// Deliberately NOT CURSOR_CHAT_MODEL: that name is already set in the ambient shell
// and would silently override this app's default.
export const DEFAULT_MODEL = process.env.ASSETS_MODEL || "grok-4.6";

export const fallbackModels: ModelOption[] = [
  { id: "grok-4.6", label: "Cursor Grok 4.6" },
  { id: "grok-4.5", label: "Cursor Grok 4.5" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "composer-2.5", label: "Composer 2.5" },
];

let cached: { expiresAt: number; models: ModelOption[] } | null = null;

export async function getModelOptions(): Promise<ModelOption[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  if (!process.env.CURSOR_API_KEY) return fallbackModels;

  try {
    const response = (await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY })) as unknown;
    const models = normalize(response);
    cached = { expiresAt: Date.now() + 5 * 60 * 1000, models: models.length ? models : fallbackModels };
    return cached.models;
  } catch {
    return fallbackModels;
  }
}

function normalize(response: unknown): ModelOption[] {
  const raw = Array.isArray(response)
    ? response
    : Array.isArray((response as { models?: unknown[] })?.models)
      ? (response as { models: unknown[] }).models
      : [];

  const models = raw.map(toOption).filter((model): model is ModelOption => model !== null);
  const seen = new Set(models.map((model) => model.id));

  return [...models, ...fallbackModels.filter((model) => !seen.has(model.id))];
}

function toOption(model: unknown): ModelOption | null {
  if (typeof model === "string") return { id: model, label: labelFor(model) };
  if (!model || typeof model !== "object") return null;

  const record = model as { id?: unknown; name?: unknown; displayName?: unknown };
  const id =
    typeof record.id === "string" ? record.id : typeof record.name === "string" ? record.name : "";
  if (!id) return null;

  return {
    id,
    label: typeof record.displayName === "string" ? record.displayName : labelFor(id),
  };
}

function labelFor(id: string) {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
