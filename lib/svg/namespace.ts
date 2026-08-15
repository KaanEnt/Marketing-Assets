/**
 * Rewrite every id in a subtree so several copies of one document can share a page.
 *
 * SVG references are document-scoped, not element-scoped: clip-path="url(#photo)"
 * resolves against the first #photo in the whole page, not the one in the same
 * <svg>. Rendering adaptation thumbnails alongside the live artboard therefore has
 * every preview silently borrowing the artboard's masks, patterns and gradients,
 * which looks almost right and is completely wrong.
 *
 * Only the previews are namespaced. The document handed to the editor keeps its
 * real ids, because those ids are the layer identity the whole app is built on.
 */
export function namespaceIds(root: Element, prefix: string): Element {
  const rename = new Map<string, string>();

  for (const element of Array.from(root.querySelectorAll("[id]"))) {
    const id = element.getAttribute("id");
    if (!id) continue;
    const next = `${prefix}${id}`;
    rename.set(id, next);
    element.setAttribute("id", next);
  }

  if (rename.size === 0) return root;

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;

      if (value.startsWith("#")) {
        const next = rename.get(value.slice(1));
        if (next) element.setAttribute(attribute.name, `#${next}`);
        continue;
      }

      if (!value.includes("url(#")) continue;
      element.setAttribute(
        attribute.name,
        value.replace(/url\(#([^)]+)\)/g, (whole, id: string) => {
          const next = rename.get(id.trim().replace(/^["']|["']$/g, ""));
          return next ? `url(#${next})` : whole;
        }),
      );
    }
  }

  return root;
}
