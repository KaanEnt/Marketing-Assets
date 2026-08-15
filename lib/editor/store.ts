import { create } from "zustand";

import { identityTransform, type BaseBox, type LayerTransform } from "@/lib/editor/transform";
import type { LayerInfo } from "@/lib/svg/layers";
import { DEFAULT_PRESET, type PresetId } from "@/lib/layout/presets";

export type EditorLayer = LayerInfo & {
  /** Measured from the DOM once the document renders; null until then. */
  baseBox: BaseBox | null;
  transform: LayerTransform | null;
  visible: boolean;
  locked: boolean;
};

type Snapshot = Record<string, { transform: LayerTransform | null; visible: boolean; locked: boolean }>;

const HISTORY_LIMIT = 50;

export type SlotState = "pending" | "generating" | "filled" | "failed";

type EditorState = {
  svg: string | null;
  presetId: PresetId;
  layers: EditorLayer[];
  selection: string[];
  past: Snapshot[];
  future: Snapshot[];
  slotState: Record<string, SlotState>;
  /**
   * Locked from the first illustration of a project and reused verbatim after.
   * Raster art cannot be recoloured, so consistency has to be bought at prompt
   * time or the assets in one campaign end up in visibly different styles.
   */
  illustrationStyle?: string;
  setSlotState: (id: string, state: SlotState) => void;
  setIllustrationStyle: (style: string) => void;

  setDocument: (svg: string, presetId: PresetId, layers: LayerInfo[]) => void;
  setBaseBoxes: (boxes: Record<string, BaseBox>) => void;
  select: (ids: string[]) => void;
  /**
   * Snapshot the current state as an undo point. Must be called BEFORE the first
   * mutation of an interaction: a drag emits many updates, so capturing at the
   * end would record the already-dragged state as the thing to undo to.
   */
  pushHistory: () => void;
  setTransforms: (next: Record<string, LayerTransform>) => void;
  nudge: (dx: number, dy: number) => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

export const useEditor = create<EditorState>((set, get) => ({
  svg: null,
  presetId: DEFAULT_PRESET,
  layers: [],
  selection: [],
  past: [],
  future: [],
  slotState: {},

  setSlotState: (id, state) =>
    set((current) => ({ slotState: { ...current.slotState, [id]: state } })),

  setIllustrationStyle: (style) => set({ illustrationStyle: style }),

  /**
   * Merge an incoming document into the current stack by id.
   *
   * A follow-up prompt rewrites the whole document, so matching ids keep the
   * transform, visibility and lock the user set. Without this every revision
   * would silently discard their manual work.
   */
  setDocument: (svg, presetId, incoming) => {
    const existing = new Map(get().layers.map((layer) => [layer.id, layer]));

    set({
      svg,
      presetId,
      layers: incoming.map((layer) => {
        const previous = existing.get(layer.id);
        return {
          ...layer,
          // Geometry changed, so the measured box is stale and gets re-measured.
          baseBox: null,
          transform: previous?.transform ?? null,
          visible: previous?.visible ?? true,
          locked: previous?.locked ?? false,
        };
      }),
      selection: [],
      past: [],
      future: [],
      // Geometry is new, so previously filled slots must be regenerated. The
      // illustration style deliberately survives, since it defines the project.
      slotState: {},
    });
  },

  setBaseBoxes: (boxes) =>
    set((state) => ({
      layers: state.layers.map((layer) => {
        const box = boxes[layer.id];
        if (!box) return layer;

        // A transform carried over from a previous revision is kept as-is: the
        // user put the layer there deliberately and a redraw should not move it.
        // Only a layer that has never been touched adopts the authored position.
        return { ...layer, baseBox: box, transform: layer.transform ?? identityTransform(box) };
      }),
    })),

  select: (ids) => set({ selection: ids }),

  pushHistory: () =>
    set((state) => ({
      past: [...state.past, snapshot(state.layers)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setTransforms: (next) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        next[layer.id] ? { ...layer, transform: next[layer.id]! } : layer,
      ),
    })),

  nudge: (dx, dy) => {
    const { layers, selection } = get();
    if (selection.length === 0) return;

    const next: Record<string, LayerTransform> = {};
    for (const layer of layers) {
      if (!selection.includes(layer.id) || layer.locked || !layer.transform) continue;
      next[layer.id] = { ...layer.transform, cx: layer.transform.cx + dx, cy: layer.transform.cy + dy };
    }

    if (Object.keys(next).length === 0) return;
    get().pushHistory();
    get().setTransforms(next);
  },

  toggleVisible: (id) => {
    get().pushHistory();
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer,
      ),
    }));
  },

  toggleLock: (id) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, locked: !layer.locked } : layer,
      ),
    })),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;

      return {
        past: state.past.slice(0, -1),
        future: [snapshot(state.layers), ...state.future].slice(0, HISTORY_LIMIT),
        layers: restore(state.layers, previous),
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;

      return {
        past: [...state.past, snapshot(state.layers)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        layers: restore(state.layers, next),
      };
    }),

  reset: () => set({ svg: null, layers: [], selection: [], past: [], future: [] }),
}));

function snapshot(layers: EditorLayer[]): Snapshot {
  const result: Snapshot = {};
  for (const layer of layers) {
    result[layer.id] = {
      transform: layer.transform ? { ...layer.transform } : null,
      visible: layer.visible,
      locked: layer.locked,
    };
  }
  return result;
}

function restore(layers: EditorLayer[], state: Snapshot): EditorLayer[] {
  return layers.map((layer) => {
    const saved = state[layer.id];
    if (!saved) return layer;
    return {
      ...layer,
      transform: saved.transform ? { ...saved.transform } : layer.transform,
      visible: saved.visible,
      locked: saved.locked,
    };
  });
}
