# Vellum: deck source

Everything needed to generate a presentation about this project. Narrative, design
system, and slide-by-slide breakdown.

`Vellum` is a placeholder name (print and design heritage, works for both flyers and
social). Alternates: Baseline, Foundry, Artboard. Trademark and domain availability
are unverified.

---

## 1. The narrative

### One sentence

Vellum is a chat that designs marketing assets as real editable vector files, not flat
images.

### The problem

A small business needs an insurance flyer, then the same campaign as an Instagram
story, a LinkedIn banner, and a printed Letter handout. Today that is either a designer
at agency rates and agency turnaround, or a template tool where you do the work
yourself, or an image generator that hands back a JPEG you cannot fix.

### Why each existing tool fails

| Tool | What it gives | Where it breaks |
| --- | --- | --- |
| Canva | Templates and a manual editor | You are the designer. It starts from a template, not from your intent |
| Figma | Total control | Requires design skill. Produces nothing on its own |
| Image generators | Instant visuals | Flat raster. No layers, no text edit, no resize without recropping |

### The insight

The industry pointed generative AI at pixels. Pixels are the wrong output.

A marketing asset is structured: a headline, a photo panel, a logo lockup, a contact
block. That structure is exactly what SVG encodes and exactly what a language model is
good at writing. Point the model at the structure and you get something that is
generated *and* editable, which no tool in that table offers.

### The solution

The model writes one SVG document. The app splits it on top-level groups into an
independent, Figma-style layer stack. Every layer is selectable, draggable, restylable
by hand. Follow-up prompts patch layers by stable ID rather than regenerating from
scratch, so manual work survives.

### The differentiator

One design adapts to every format through a constraint system, not a crop. Each layer
carries anchoring rules, so a Letter flyer becomes a correctly composed Instagram story
rather than a badly cropped one. That is what a campaign actually needs and what no
generator does.

### The flywheel

Generate a logo. It seeds a brand kit: palette, fonts, tone. Every asset afterwards
inherits it. The tenth asset is better and faster than the first, because the system
knows the brand. This is what turns a generator into a tool people keep.

### The honest boundary

The model composes, masks, gradients, patterns and typography. It does not draw
figurative illustration well, so that goes to Gemini as transparent PNG.

Saying this out loud is a strength. It shows the architecture is designed around real
model capability rather than around a demo.

The same boundary is what makes imported photography work. The user brings a real
product or a real face, Gemini re-lights it and replaces its background without
touching the subject, and the SVG layer keeps ownership of the type, the palette and
the composition. Neither side is asked to do the other's job.

---

## 2. Design system

Use the product's own visual language for the deck. Coherence between what is pitched
and how it is pitched does real persuasive work.

### Palette

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| Core | Ink | `#0B0B0F` | Body text on light, background on dark slides |
| Core | Paper | `#FAF9F6` | Default slide background, warm not clinical |
| Core | Graphite | `#4A4E5A` | Secondary text, captions, labels |
| Core | Mist | `#E4E4E9` | Borders, dividers, table rules |
| Brand | Signal Blue | `#2B5FFF` | Primary. Actions, emphasis, selection state |
| Brand | Magenta | `#E93D9B` | Accent. Gradient partner, never alone as text |
| Brand | Amber | `#FFB020` | Third gradient stop. Marks raster and generated content |
| Brand | Vector Green | `#12B981` | Reserved. Marks vector and editable content only |

**The one rule that makes the deck legible.** Vector Green and Amber are semantic, not
decorative. Green always means editable vector. Amber always means generated raster.
Once the audience learns it on slide 6, every later diagram reads instantly without a
legend.

**Gradient.** Radial blooms of Signal Blue and Magenta over Paper, soft and wide. Title
slide, section dividers, and the backdrop behind product shots only. Never behind body
copy.

### Typography

| Role | Face | Weight | Tracking | Size at 1920x1080 |
| --- | --- | --- | --- | --- |
| Slide title | Inter Tight | 800 | -3% | 72px |
| Subhead | Inter Tight | 600 | -1% | 40px |
| Body | Inter | 400 / 500 | 0 | 28px |
| Section label | Inter | 600 | +8% uppercase | 20px |
| Code | JetBrains Mono | 400 | 0 | 20px |

Body copy never below 24px. If it does not fit, the slide has too much on it.

### Layout

96px margins. 12-column grid, 32px gutters. Left-aligned throughout, centered only on
the title slide. One idea per slide, enforced.

### Recurring motifs

All five are pulled from the product, so the deck demonstrates the thing it describes.

1. **Layer stack** - offset rectangles with 1px Mist borders and a 4px Y offset,
   echoing the layer tree
2. **Selection frame** - 2px Signal Blue rectangle with small square corner handles
3. **Constraint pins** - short arrows on box edges showing anchoring, used on the adapt
   slides
4. **Code block** - Ink background, Paper mono text, Signal Blue for attribute names
5. **Halftone disc** - diagonal-stripe circle, as a corner accent on dividers

### Slide types

Title (gradient, centered) - Statement (Ink background, one line, nothing else) -
Divider (gradient wash, section number and label) - Content (Paper, title plus body
plus visual) - Comparison (three columns) - Diagram (Paper, full-bleed visual) - Code
(Ink background, mono)

---

## 3. Slide-by-slide

| # | Type | Content |
| --- | --- | --- |
| 1 | Title | **Vellum.** "Marketing assets that stay editable." Gradient, logo lockup |
| 2 | Statement | "A JPEG is not a design asset." Ink slide, single line |
| 3 | Content | The problem. One campaign, four formats, three bad options. Show the insurance flyer as the concrete case |
| 4 | Comparison | Canva / Figma / Image generators. The failure table, three columns |
| 5 | Statement | "We pointed AI at pixels. The answer was structure." |
| 6 | Diagram | The insight. A flyer decomposed into labelled parts: headline, photo panel, logo lockup, contact block. Green for vector, Amber for the photo. Establishes the color grammar |
| 7 | Content | What it is. Two surfaces: prompt landing, three-column studio. Product shots |
| 8 | Diagram | How it works. Pipeline: prompt to agent to SVG document to sanitize and validate to split on groups to layer stack |
| 9 | Code | The contract. Annotated SVG snippet with `id`, `data-h`, `data-v`, `data-slot`. The technical heart of the pitch |
| 10 | Diagram | Layers. AI output on the left, editable stack on the right, selection frame motif |
| 11 | Diagram | One design, every format. Letter flyer transforming into story, square and banner. Constraint pins visible. **The money slide** |
| 12 | Diagram | The brand kit flywheel. Logo to palette and fonts to every asset. Circular |
| 13 | Content | Capability boundary. What the model draws well (composition, masks, gradients, type) versus what it does not (figurative illustration, delegated to Gemini). Honesty as credibility |
| 14 | Content | Architecture. SVG DOM render, Fabric shadow canvas, Cursor SDK on gpt-5.6, Gemini for raster, browser-only storage, no auth |
| 15 | Content | Build plan. Eleven phases on a timeline, with the phase 3 quality gate called out |
| 16 | Content | Risks, stated plainly. Text wrapping is the schedule risk, model design quality is the product risk, both have named fallbacks |
| 17 | Statement | Close. "Generated. Editable. Every format." Gradient |

**Speaker-note guidance.** Slides 6, 9 and 11 carry the argument. If the deck gets cut
to five minutes, keep 2, 4, 6, 11, 17.

---

## 4. Supporting facts

Numbers and specifics that can be pulled onto slides.

**Format coverage.** 12 presets across social and print: Instagram square, portrait and
story, LinkedIn post and square, X, Facebook feed, YouTube thumbnail, US Letter, A4,
plus two logo canvases.

**The technique inventory.** The model is taught 11 SVG techniques distilled from
reference designs: clipPath masks, offset outline strokes, pattern fills, multi-stop
gradients, translucent overlays, text highlight bars, concentric arcs, duotone photo
filters, icon glyphs, logo lockups, and illustration slots.

**Constraint model.** Each layer carries a horizontal anchor
(`left | right | center | scale | stretch`) and a vertical anchor
(`top | bottom | center | scale | stretch`). Format transformation is a deterministic
solve, not a model call, so it is instant and free.

Two rules are what make the output look designed rather than resized:

- **Whitespace scales with the art.** Figma holds a margin at its absolute value
  because it resizes interfaces within one medium. Transposing a composition between
  media, a held-constant margin quietly tightens every edge as the frame grows. The
  gap to the anchored edge scales by the same factor as the layer.
- **Only `stretch` licenses a shape change.** Every other layer takes one scale factor
  on both axes, so a circular photo mask stays circular and a logo lockup stays square.
  A photo panel that declares `stretch` does reshape, and the photograph inside it
  carries a counter-scale so the crop changes rather than the person in it.

**Auto-correct.** The solve is followed by a deterministic repair pass: backgrounds are
grown to cover the frame and its print bleed, copy is pulled back inside the safe area,
overlapping text blocks are pushed apart, and type that came out below the format's
legibility floor is reported. What the pass cannot fix, it names, and only those
specific problems are handed to the model as a rework brief.

**Stack.** Next.js, TypeScript strict, SVG DOM rendering, Fabric v6 for editor
mechanics, Cursor SDK on `grok-4.6` with a `gpt-5.6-sol` rescue pass, Gemini
`gemini-3-pro-image` for raster, IndexedDB for storage, no auth.

**Enhancement modes.** Four, because a studio product shot, a thumbnail hero and a
layerable cutout want opposite treatments: `auto`, `product`, `thumbnail`, `cutout`.
Each runs from the image as imported rather than the last result, so passes never
compound.
