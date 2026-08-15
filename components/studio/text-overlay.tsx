"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { useEditor } from "@/lib/editor/store";
import { availableWidth, effectiveRun, runElement, type TextEdit, type TextRun } from "@/lib/text/runs";

/** Rough ascender as a fraction of the em, used to line the caret up with the baseline. */
const ASCENDER = 0.8;

/**
 * Edit copy in an HTML element positioned over the artboard.
 *
 * Not a <foreignObject>: Safari refuses to rasterize those, which would break PNG
 * export, and the contract forbids them for exactly that reason. An overlay in
 * screen space gets the caret, the selection, the clipboard and IME for free,
 * none of which SVG text provides.
 */
export function TextOverlay({
  host,
  scale,
}: {
  host: React.RefObject<HTMLDivElement | null>;
  scale: number;
}) {
  const editingRun = useEditor((state) => state.editingRun);
  const runs = useEditor((state) => state.runs);
  const textEdits = useEditor((state) => state.textEdits);

  const run = editingRun ? runs[editingRun] : undefined;
  if (!run) return null;

  // Keyed on the run so opening a different block mounts a fresh field rather
  // than reusing one still holding the previous block's caret and content.
  return <Field key={run.key} host={host} run={run} edit={textEdits[run.key]} scale={scale} />;
}

function Field({
  host,
  run,
  edit,
  scale,
}: {
  host: React.RefObject<HTMLDivElement | null>;
  run: TextRun;
  edit: TextEdit | undefined;
  scale: number;
}) {
  const setTextEdit = useEditor((state) => state.setTextEdit);
  const setEditingRun = useEditor((state) => state.setEditingRun);
  const field = useRef<HTMLDivElement>(null);
  const merged = effectiveRun(run, edit);

  /**
   * Place and style the field from a live measurement.
   *
   * Written straight onto the node rather than held in state. The values come
   * from getScreenCTM, which can only be read after the browser has laid the
   * document out, so routing them through state would mean rendering once with
   * nothing and again with the answer. A layout effect runs before paint, so
   * doing it imperatively means the field is never seen unplaced.
   */
  useLayoutEffect(() => {
    const container = host.current;
    const node = field.current;
    if (!container || !node) return;

    const root = container.querySelector("svg");
    const group = root?.querySelector(`#${CSS.escape(run.layerId)}`);
    const element = group instanceof SVGGElement ? runElement(group, run.index) : null;
    const ctm = element?.getScreenCTM();
    if (!element || !ctm) return;

    const bounds = container.getBoundingClientRect();
    const scaleX = Math.hypot(ctm.a, ctm.b);
    const scaleY = Math.hypot(ctm.c, ctm.d);

    const column = availableWidth(merged);
    const fontSize = merged.style.size * scaleY;
    const lineHeight = fontSize * merged.style.lineHeight;

    // Anchor the field the way the text is anchored, so what is typed reflows
    // exactly where it will render.
    const anchor = merged.style.anchor;
    const localLeft =
      anchor === "start" ? merged.x : anchor === "end" ? merged.x - column : merged.x - column / 2;
    const origin = new DOMPoint(localLeft, merged.baseline).matrixTransform(ctm);

    Object.assign(node.style, {
      left: `${origin.x - bounds.left}px`,
      // An HTML line box puts its baseline half the leading plus the ascender
      // down from its top, which is what lines the field up with the type.
      top: `${origin.y - bounds.top - ((lineHeight - fontSize) / 2 + ASCENDER * fontSize)}px`,
      width: `${column * scaleX}px`,
      fontSize: `${fontSize}px`,
      lineHeight: `${lineHeight}px`,
      letterSpacing: `${merged.style.letterSpacing * scaleX}px`,
      // The resolved family, not the authored name: the stylesheet rewrites
      // font-family="Archivo" to the hashed face next/font actually served.
      fontFamily: getComputedStyle(element).fontFamily,
      fontWeight: String(merged.style.weight),
      color: merged.style.fill,
      textAlign: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
      visibility: "visible",
    } satisfies Partial<CSSStyleDeclaration>);

    // The SVG run is hidden while its field is open. Showing both means two
    // copies of the same words a pixel apart, and the small disagreement between
    // an HTML line box and an SVG baseline becomes the loudest thing on screen.
    element.style.visibility = "hidden";
    return () => {
      element.style.visibility = "";
    };
  }, [host, run, merged, scale]);

  useEffect(() => {
    const node = field.current;
    if (!node) return;

    node.textContent = merged.content;
    node.focus();

    // Select everything, the way double-clicking into type behaves elsewhere:
    // the common case is replacing placeholder copy wholesale.
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Mount only. The component is keyed on the run, so a mount is a new block,
    // and re-running on a re-measure would throw the caret to the end mid-word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    const next = (field.current?.innerText ?? "").replace(/ /g, " ").trim();
    if (next !== merged.content) setTextEdit(run.key, { content: next });
    setEditingRun(null);
  };

  return (
    <div
      ref={field}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Edit text"
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(event) => {
        // The canvas binds arrows and Escape on window; while typing they belong
        // to the caret, not to the layer underneath.
        event.stopPropagation();
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          commit();
        }
      }}
      className="absolute z-20 outline-none ring-2 ring-signal/70"
      style={{
        visibility: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        caretColor: "#2B5FFF",
        background: "rgba(255,255,255,0.55)",
      }}
    />
  );
}
