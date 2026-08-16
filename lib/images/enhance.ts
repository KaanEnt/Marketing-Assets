import "server-only";

import type { GenerateContentResponse } from "@google/genai";

import {
  firstInlineImage,
  getClient,
  inlinePart,
  noImageReason,
  type GeneratedImage,
} from "@/lib/images/client";
import { IMAGE_MODEL } from "@/lib/images/generate";
import type { EnhanceMode } from "@/lib/images/modes";

/**
 * The clause every mode carries.
 *
 * An image generator asked to "improve" a photo will happily redesign the product, so
 * the preservation contract is stated before the creative direction rather than after
 * it. In testing this is the difference between a relit bottle and a different bottle.
 */
const PRESERVE = `This is the user's own photograph of something real, not a concept to
reinterpret. The subject must survive the edit unchanged: the same object or the same
people, the same identity, proportions, colours, materials and pose. Reproduce every
character of any text visible on the subject exactly as photographed, in the same
typeface and the same position. Do not restyle, beautify, slim, age, re-typeset,
translate, or invent anything that belongs to the subject.`;

const MODE_PROMPT: Record<EnhanceMode, string> = {
  auto: `Re-shoot this photograph as a professional marketing image.

CHANGE: replace the background with a clean, uncluttered setting that suits the subject
and stays quiet behind it. Relight with a large soft key, a gentle fill and a soft rim
that separates the subject from the background. Remove dust, crumbs, smudges, stray
objects and background clutter. Neutral white balance, no colour cast, crisp focus on
the subject. Recompose centred with even margins.

No added text, no watermark, no logos beyond those already on the subject, no hands.`,

  product: `Re-photograph this exact product as a professional studio e-commerce hero shot.

CHANGE: replace the background with a seamless studio backdrop in a soft neutral tone
with a subtle gradient falloff and nothing competing with the product. Relight with a
large soft key from the upper left, a gentle fill on the right, and a soft rim
separating the edge from the background. Add a natural contact shadow and a faint
reflection on the surface below. Remove dust, crumbs, fingerprints, smudges and
scratches from both the product and the surface. Neutral white balance, clean whites,
crisp focus on the label. Recompose centred with even margins and generous breathing
room, camera straight on at product height.

The label is the product's identity: every word, number and mark on it stays exactly as
photographed. No added text, no watermark, no invented branding, no hands, no clutter.`,

  thumbnail: `Rework this frame into a thumbnail hero image.

CHANGE: lift the subject out of its original surroundings and place it on a dramatic
dark background with a saturated colour glow behind it. Tighten the crop so the subject
fills the frame. Dramatic rim lighting, high contrast, rich saturation, a subtle
vignette. Leave the top third clean and uncluttered.

No text, no letters, no numbers, no logos, no watermark. The headline is set as real
type over this image afterwards, so any lettering you draw will collide with it.`,

  cutout: `Remove the background from this photograph and return the subject on full
transparency.

CHANGE: erase the background and anything the subject is resting on, sitting in or
standing against, so only the subject remains. Clean, accurate matte edges including
hair and thin details. Keep every subject at its exact position and scale within the
frame: do not move, re-pose, duplicate, add or remove anyone or anything. Relight with
punchy directional light and a soft rim so the subject separates from a dark
background, and lift contrast and saturation slightly so it stays legible at small size.

Fully transparent background. No background fill, no drop shadow, no text, no watermark.`,
};

/**
 * Framing is dictated for the two modes with a known destination and left alone for the
 * two without one: re-cropping a cutout would move the subject inside its own frame,
 * which is exactly what the mode promises not to do.
 */
const MODE_ASPECT: Partial<Record<EnhanceMode, string>> = {
  product: "1:1",
  thumbnail: "16:9",
};

export function enhancePrompt(mode: EnhanceMode, instruction?: string): string {
  const parts = [PRESERVE, "", MODE_PROMPT[mode]];

  const direction = instruction?.trim();
  if (direction) {
    parts.push(
      "",
      "Additional direction from the user, which overrides the guidance above where the",
      `two disagree, but never overrides the preservation rules: ${direction}`,
    );
  }

  return parts.join("\n");
}

export type EnhanceOptions = {
  dataUri: string;
  mode: EnhanceMode;
  instruction?: string;
  signal?: AbortSignal;
};

/**
 * One retry, because the failure it covers is stochastic rather than deterministic.
 *
 * Editing a photograph of real people intermittently comes back text-only or blocked,
 * and the identical request then succeeds. Failing the command on the first empty
 * response makes the feature look broken when it is merely flaky.
 */
const ATTEMPTS = 2;

export type EnhanceResult = GeneratedImage & {
  /**
   * Every attempt is billed, including one that came back without a picture:
   * the photograph still went up as input and the refusal still came back as
   * output. Accumulating them is the difference between settling what the
   * enhancement cost and settling what its last attempt cost.
   */
  usage: GenerateContentResponse["usageMetadata"];
  /** How many pictures were actually produced, which is what the flat rate applies to. */
  images: number;
};

function mergeUsage(
  into: GenerateContentResponse["usageMetadata"],
  next: GenerateContentResponse["usageMetadata"],
): GenerateContentResponse["usageMetadata"] {
  if (!next) return into;
  if (!into) return next;

  return {
    promptTokenCount: (into.promptTokenCount ?? 0) + (next.promptTokenCount ?? 0),
    candidatesTokenCount: (into.candidatesTokenCount ?? 0) + (next.candidatesTokenCount ?? 0),
    cachedContentTokenCount:
      (into.cachedContentTokenCount ?? 0) + (next.cachedContentTokenCount ?? 0),
    totalTokenCount: (into.totalTokenCount ?? 0) + (next.totalTokenCount ?? 0),
  };
}

export async function enhanceImage(options: EnhanceOptions): Promise<EnhanceResult> {
  const aspectRatio = MODE_ASPECT[options.mode];
  let lastReason = "no reason reported";
  let usage: GenerateContentResponse["usageMetadata"];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const response = await getClient().models.generateContent({
      model: IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [inlinePart(options.dataUri), { text: enhancePrompt(options.mode, options.instruction) }],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        ...(aspectRatio ? { imageConfig: { aspectRatio, imageSize: "2K" } } : {}),
        ...(options.signal ? { abortSignal: options.signal } : {}),
      },
    });

    usage = mergeUsage(usage, response.usageMetadata);

    const image = firstInlineImage(response);
    if (image) return { ...image, usage, images: 1 };

    lastReason = noImageReason(response);
    console.warn(`[enhance] ${options.mode} attempt ${attempt}/${ATTEMPTS} returned no image (${lastReason})`);

    if (options.signal?.aborted) break;
  }

  // Attempts that produced nothing were still billed for the photograph going up
  // and the refusal coming back, so the failure carries its usage. A caller that
  // simply refunded here would under-count a path that costs real money every
  // time a user retries it.
  throw new EnhanceFailure(
    `The model returned no image after ${ATTEMPTS} attempts (${lastReason}). Try again, or a different mode.`,
    usage,
  );
}

export class EnhanceFailure extends Error {
  constructor(
    message: string,
    readonly usage: GenerateContentResponse["usageMetadata"],
  ) {
    super(message);
    this.name = "EnhanceFailure";
  }
}
