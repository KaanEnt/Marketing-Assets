import { create } from "zustand";

import { getTemplate, type TemplateId } from "@/lib/templates/catalog";
import { isPresetId, type PresetId } from "@/lib/layout/presets";

type ComposerState = {
  presetId: PresetId;
  templateId: TemplateId | null;
  /** Pick a skeleton. The format comes with it; they are never chosen separately. */
  selectTemplate: (id: TemplateId) => void;
  setPreset: (id: string) => void;
};

/**
 * The landing page's brief, shared between the prompt box and the template
 * gallery.
 *
 * They sit in different regions of a server-rendered page, so lifting the state
 * into a component would mean turning the whole page into a client tree just to
 * pass two strings down. A store keeps the page a server component, which is
 * what lets it read the skeleton files off disk in the first place.
 */
export const useComposer = create<ComposerState>((set) => ({
  presetId: "ig-square",
  templateId: null,

  selectTemplate: (id) =>
    set((state) => {
      const template = getTemplate(id);
      if (!template) return state;
      // Clicking the selected card again clears it, back to a free composition.
      if (state.templateId === id) return { ...state, templateId: null };
      return { ...state, templateId: id, presetId: template.presetId };
    }),

  setPreset: (id) =>
    set((state) => {
      if (!isPresetId(id)) return state;
      // A skeleton is drawn at exactly one format, so choosing a different one
      // abandons it rather than silently generating something the card did not show.
      const keep = state.templateId && getTemplate(state.templateId)?.presetId === id;
      return { presetId: id, templateId: keep ? state.templateId : null };
    }),
}));
