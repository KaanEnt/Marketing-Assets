import { describeImage } from "@/lib/images/describe";
import { enhanceImage } from "@/lib/images/enhance";
import { isImageGenConfigured } from "@/lib/images/client";
import { isEnhanceMode } from "@/lib/images/modes";

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

  try {
    const image = await enhanceImage({ dataUri, mode, instruction: payload.instruction });

    // Described after the edit rather than before: the layout is composed around what
    // the design agent will actually be handed, which is the enhanced picture.
    const description = await describeImage(image.dataUri).catch(() => "");

    return Response.json({ dataUri: image.dataUri, description });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enhancement failed." },
      { status: 502 },
    );
  }
}
