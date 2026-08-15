const SVG_NS = "http://www.w3.org/2000/svg";

export type SlotKind = "image" | "illustration";

export type Slot = {
  id: string;
  kind: SlotKind;
  prompt: string;
  /** Set when the slot is bound to an image the user imported rather than a prompt. */
  assetId?: string;
  /** Local-space box of the placeholder, used to place the image and pick framing. */
  box: { x: number; y: number; width: number; height: number };
  filled: boolean;
};

export function findSlots(root: Element): Slot[] {
  const slots: Slot[] = [];

  for (const group of Array.from(root.querySelectorAll("[data-slot]"))) {
    const kind = group.getAttribute("data-slot");
    if (kind !== "image" && kind !== "illustration") continue;

    const id = group.getAttribute("id");
    if (!id || !(group instanceof SVGGElement)) continue;

    // getBBox is in the element's own user space, before its own transform, which
    // is exactly the space a child <image> will be placed in.
    const box = group.getBBox();
    if (box.width <= 0 || box.height <= 0) continue;

    slots.push({
      id,
      kind,
      prompt: group.getAttribute("data-prompt") ?? "",
      assetId: group.getAttribute("data-asset") || undefined,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      filled: group.getAttribute("data-filled") === "1",
    });
  }

  return slots;
}

/**
 * Drop a generated picture into a slot.
 *
 * Photography is clipped to the exact shape the model drew, so an arc-masked or
 * circular slot stays arc-masked, and uses "slice" so it fills the shape edge to
 * edge with no letterboxing. Illustration is transparent art that has to sit over
 * whatever is behind it, so it is never clipped and uses "meet" to stay whole.
 */
export function fillSlot(root: Element, slot: Slot, dataUri: string): boolean {
  const group = root.querySelector(`#${CSS.escape(slot.id)}`);
  if (!(group instanceof SVGGElement)) return false;

  // Replace rather than stack, so regenerating a slot does not pile up images.
  group.querySelector("image[data-generated]")?.remove();

  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", dataUri);
  image.setAttribute("x", String(slot.box.x));
  image.setAttribute("y", String(slot.box.y));
  image.setAttribute("width", String(slot.box.width));
  image.setAttribute("height", String(slot.box.height));
  image.setAttribute("data-generated", "1");

  if (slot.kind === "image") {
    image.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const clipId = `slot-clip-${slot.id}`;
    ensureClipPath(root, clipId, group);
    image.setAttribute("clip-path", `url(#${clipId})`);
  } else {
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  group.appendChild(image);
  group.setAttribute("data-filled", "1");
  return true;
}

/** Clone the placeholder geometry into a clipPath so the mask matches it exactly. */
function ensureClipPath(root: Element, clipId: string, group: SVGGElement) {
  const svg = root.closest("svg") ?? root;
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  defs.querySelector(`#${CSS.escape(clipId)}`)?.remove();

  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.setAttribute("id", clipId);
  for (const child of Array.from(group.children)) {
    if (child.tagName.toLowerCase() === "image") continue;
    clip.appendChild(child.cloneNode(true));
  }

  defs.appendChild(clip);
}

/**
 * Dominant colours of the document, fed to the image prompt so generated art
 * lands in-palette instead of arriving in unrelated colours that need recolouring
 * we cannot do on raster.
 */
export function extractPalette(root: Element, limit = 5): string[] {
  const counts = new Map<string, number>();

  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of ["fill", "stop-color", "stroke"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;

      const hex = value.trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) continue;
      // Near-white and near-black carry no brand signal.
      if (hex === "#ffffff" || hex === "#000000") continue;

      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => hex);
}
