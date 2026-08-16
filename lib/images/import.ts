/**
 * Bring a file off the user's disk and into the app as a data URI.
 *
 * Downscaling here is not a nicety. The image rides in JSON to the enhancement API,
 * back again, into a data URI inside the SVG document, and through session storage on
 * the landing-page handoff. A 12-megapixel phone photo breaks the last of those and
 * makes the rest slow, while the model gains nothing from the extra pixels.
 */
const MAX_EDGE = 1536;
const JPEG_QUALITY = 0.9;

export type ImportedImage = {
  dataUri: string;
  width: number;
  height: number;
  /** True when the source carries real transparency, so it must stay PNG. */
  hasAlpha: boolean;
};

export class ImportError extends Error {}

export async function importImageFile(file: File): Promise<ImportedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImportError(`${file.name} is not an image.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImportError(`${file.name} could not be decoded.`);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ImportError("This browser refused a 2D canvas.");

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG is several times smaller, but flattening a cutout onto black would destroy
  // it, so the encoding follows what the pixels actually contain.
  const hasAlpha = canvasHasAlpha(context, width, height);
  const dataUri = hasAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  return { dataUri, width, height, hasAlpha };
}

/** Sampled rather than exhaustive: a real cutout has transparent corners, not one stray pixel. */
function canvasHasAlpha(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4 * 16) {
    if (data[index]! < 250) return true;
  }
  return false;
}

/**
 * Dimensions of an image the app did not decode itself. An enhancement changes the
 * framing, and a stale aspect ratio would tell the design agent to build a slot the
 * picture no longer fits.
 */
export function measureDataUri(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new ImportError("The enhanced image could not be measured."));
    image.src = dataUri;
  });
}

export function fileLabel(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").trim().slice(0, 48) || "Imported image";
}
