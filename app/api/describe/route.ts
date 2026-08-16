import { describeImage } from "@/lib/images/describe";
import { isImageGenConfigured } from "@/lib/images/client";

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

  try {
    return Response.json({ description: await describeImage(dataUri) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Description failed." },
      { status: 502 },
    );
  }
}
