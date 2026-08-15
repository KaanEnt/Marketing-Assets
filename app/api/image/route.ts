import { generateImage, isImageGenConfigured, type SlotKind } from "@/lib/images/generate";

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

  try {
    const image = await generateImage({
      prompt,
      kind: payload.kind === "illustration" ? "illustration" : "image",
      palette: payload.palette?.slice(0, 6),
      style: payload.style,
      aspect: payload.aspect,
    });

    if (!image) {
      return Response.json({ error: "The model returned no image." }, { status: 502 });
    }

    return Response.json({ dataUri: image.dataUri });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Image generation failed." },
      { status: 500 },
    );
  }
}
