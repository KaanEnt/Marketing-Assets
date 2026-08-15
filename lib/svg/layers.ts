import DOMPurify from "dompurify";

export type LayerKind = "vector" | "text" | "image" | "illustration";

export type LayerInfo = {
  id: string;
  name: string;
  kind: LayerKind;
  h: string;
  v: string;
  /** What the slot wants, when the model described it. */
  prompt?: string;
};

/**
 * The XSS boundary. The server validates structure, but the browser is where
 * injected markup would actually execute, so nothing reaches the live DOM without
 * passing through here first.
 */
export function sanitizeSvg(source: string): string {
  return DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ["data-h", "data-v", "data-box", "data-slot", "data-prompt", "data-fit", "data-icon", "data-preset"],
    FORBID_TAGS: ["script", "foreignObject", "style", "iframe"],
  });
}

export function readLayers(source: string): LayerInfo[] {
  if (typeof window === "undefined") return [];

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = document.querySelector("svg");
  if (!svg) return [];

  return Array.from(svg.children)
    .filter((child): child is SVGGElement => child.tagName.toLowerCase() === "g")
    .map((group) => {
      const id = group.getAttribute("id") ?? "";
      return {
        id,
        name: humanize(id),
        kind: kindOf(group),
        h: group.getAttribute("data-h") ?? "",
        v: group.getAttribute("data-v") ?? "",
        prompt: group.getAttribute("data-prompt") ?? undefined,
      };
    })
    .filter((layer) => layer.id);
}

function kindOf(group: SVGGElement): LayerKind {
  const slot = group.getAttribute("data-slot");
  if (slot === "image") return "image";
  if (slot === "illustration") return "illustration";
  if (group.querySelector("text")) return "text";
  return "vector";
}

function humanize(id: string): string {
  const words = id.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Reads the viewBox so the canvas can size the artboard without hardcoding. */
export function readViewBox(source: string): { width: number; height: number } | null {
  const match = source.match(/viewBox\s*=\s*["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (!match?.[1] || !match[2]) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
