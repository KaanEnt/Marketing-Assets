/**
 * Pull the SVG document out of a model reply.
 *
 * The model is told to emit exactly one fenced ```svg block, but it does not
 * always comply: it sometimes uses a bare fence, sometimes drops the fence
 * entirely, and sometimes wraps prose around it. Rather than fail the turn over
 * formatting, recover the document whenever one is recognisably present.
 */
export function extractSvg(text: string): string | null {
  const fenced = matchFenced(text);
  if (fenced) return fenced;

  // No usable fence: fall back to the outermost <svg> element in the raw text.
  const start = text.indexOf("<svg");
  const end = text.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) return null;

  return text.slice(start, end + "</svg>".length).trim();
}

function matchFenced(text: string): string | null {
  const fence = /```(?:svg|xml|html)?\s*\n([\s\S]*?)```/gi;

  for (const match of text.matchAll(fence)) {
    const body = match[1]?.trim();
    if (body && body.includes("<svg")) return body;
  }

  return null;
}

/** Strip the SVG block so the remaining prose can be shown as the chat reply. */
export function stripSvg(text: string): string {
  return text
    .replace(/```(?:svg|xml|html)?\s*\n[\s\S]*?```/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
