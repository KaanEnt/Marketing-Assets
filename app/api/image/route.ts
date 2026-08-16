import { guard } from "@kaanent/limiter/next";
import { geminiImageCallUsd } from "@kaanent/limiter/gemini";

import { IMAGE_MODEL, generateImage, isImageGenConfigured, type SlotKind } from "@/lib/images/generate";
import { limiter } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

type ImageRequest = {
  prompt?: string;
  kind?: SlotKind;
  palette?: string[];
  style?: string;
  aspect?: number;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ImageRequest;
  const prompt = payload.prompt?.trim();

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!isImageGenConfigured()) {
    return Response.json({ error: "Image generation is not configured." }, { status: 501 });
  }

  const gate = await guard(request, limiter, { operation: "image.generate" });
  if (!gate.ok) return gate.response;

  try {
    const { image, usage } = await generateImage({
      prompt,
      kind: payload.kind === "illustration" ? "illustration" : "image",
      palette: payload.palette?.slice(0, 6),
      style: payload.style,
      aspect: payload.aspect,
    });

    // A safety block or a text-only reply is billed for what it produced, which is
    // no picture and some tokens. Settling at images: 0 charges exactly that.
    await gate.settle(
      geminiImageCallUsd({ model: IMAGE_MODEL, usage, images: image ? 1 : 0 }),
    );

    if (!image) {
      return gate.decorate(Response.json({ error: "The model returned no image." }, { status: 502 }));
    }

    return gate.decorate(Response.json({ dataUri: image.dataUri }));
  } catch (error) {
    await gate.refund();
    return gate.decorate(
      Response.json(
        { error: error instanceof Error ? error.message : "Image generation failed." },
        { status: 500 },
      ),
    );
  }
}
