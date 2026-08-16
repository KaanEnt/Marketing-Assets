import { guard } from "@kaanent/limiter/next";
import { geminiTextUsd } from "@kaanent/limiter/gemini";

import { DESCRIBE_MODEL, describeImage } from "@/lib/images/describe";
import { isImageGenConfigured } from "@/lib/images/client";
import { LIMITER_SECRET, limiter } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { dataUri?: string };
  const dataUri = payload.dataUri?.trim();

  if (!dataUri?.startsWith("data:image/")) {
    return Response.json({ error: "A base64 image data URI is required." }, { status: 400 });
  }
  if (!isImageGenConfigured()) {
    return Response.json({ error: "Image description is not configured." }, { status: 501 });
  }

  const gate = await guard(request, limiter, { operation: "image.describe", secret: LIMITER_SECRET });
  if (!gate.ok) return gate.response;

  try {
    const { description, usage } = await describeImage(dataUri);
    await gate.settle(geminiTextUsd(DESCRIBE_MODEL, usage));

    return gate.decorate(Response.json({ description }));
  } catch (error) {
    await gate.refund();
    return gate.decorate(
      Response.json(
        { error: error instanceof Error ? error.message : "Description failed." },
        { status: 502 },
      ),
    );
  }
}
