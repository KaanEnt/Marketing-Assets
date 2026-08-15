import { DEFAULT_MODEL, getModelOptions } from "@/lib/ai/models";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.CURSOR_API_KEY),
    imageConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    defaultModel: DEFAULT_MODEL,
    models: await getModelOptions(),
  });
}
