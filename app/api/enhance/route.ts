import { guard } from "@kaanent/limiter/next";
import { geminiImageCallUsd, geminiTextUsd } from "@kaanent/limiter/gemini";

import { DESCRIBE_MODEL, describeImage } from "@/lib/images/describe";
import { EnhanceFailure, enhanceImage } from "@/lib/images/enhance";
import { IMAGE_MODEL } from "@/lib/images/generate";
import { isImageGenConfigured } from "@/lib/images/client";
import { isEnhanceMode } from "@/lib/images/modes";
import { LIMITER_SECRET, limiter } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 300;

type EnhanceRequest = {
  dataUri?: string;
  mode?: string;
  instruction?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as EnhanceRequest;
  const dataUri = payload.dataUri?.trim();
  const mode = payload.mode?.trim().toLowerCase() ?? "auto";

  if (!dataUri?.startsWith("data:image/")) {
    return Response.json({ error: "A base64 image data URI is required." }, { status: 400 });
  }
  if (!isEnhanceMode(mode)) {
    return Response.json({ error: `Unknown enhance mode "${mode}".` }, { status: 400 });
  }
  if (!isImageGenConfigured()) {
    return Response.json({ error: "Image generation is not configured." }, { status: 501 });
  }

  const gate = await guard(request, limiter, { operation: "image.enhance", secret: LIMITER_SECRET });
  if (!gate.ok) return gate.response;

  try {
    const image = await enhanceImage({ dataUri, mode, instruction: payload.instruction });

    // Described after the edit rather than before: the layout is composed around what
    // the design agent will actually be handed, which is the enhanced picture.
    const caption = await describeImage(image.dataUri).catch(() => null);

    await gate.settle(
      geminiImageCallUsd({ model: IMAGE_MODEL, usage: image.usage, images: image.images }) +
        geminiTextUsd(DESCRIBE_MODEL, caption?.usage),
    );

    return gate.decorate(
      Response.json({ dataUri: image.dataUri, description: caption?.description ?? "" }),
    );
  } catch (error) {
    // A run that produced no picture still burned the tokens it took to find that
    // out, so it settles at what it spent rather than refunding to zero.
    if (error instanceof EnhanceFailure) {
      await gate.settle(geminiTextUsd(IMAGE_MODEL, error.usage));
    } else {
      await gate.refund();
    }

    return gate.decorate(
      Response.json(
        { error: error instanceof Error ? error.message : "Enhancement failed." },
        { status: 502 },
      ),
    );
  }
}
