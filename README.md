# Marketing-Assets

A chat that designs marketing assets as real editable vector files, not flat images.

Describe what you need. The model writes one SVG document. The app splits it into an
independent, Figma-style layer stack you can actually manipulate. One design adapts to
every format through a constraint system rather than a crop.

Status: greenfield, in build. See [`docs/DECK.md`](docs/DECK.md) for the full project
explanation and design system.

## Why

A marketing asset is structured: a headline, a photo panel, a logo lockup, a contact
block. That structure is exactly what SVG encodes and exactly what a language model is
good at writing.

Existing tools each miss:

- **Canva** starts from a template, not from your intent. You are still the designer.
- **Figma** gives total control but requires design skill and produces nothing on its own.
- **Image generators** hand back flat raster. No layers, no text edit, no resize without recropping.

Pointing the model at structure instead of pixels gives output that is generated *and*
editable.

## How it works

```
prompt -> Cursor agent -> SVG document -> sanitize -> validate
       -> split on top-level <g> -> layer stack -> editor
```

Every top-level group in the returned document becomes a layer with a stable semantic
ID. Follow-up prompts rewrite the document, and the parser diffs incoming IDs against
the current tree so matching layers update in place and manual transforms survive.

Each layer carries anchoring constraints (`data-h`, `data-v`). Changing format runs a
deterministic solve plus an auto-correct pass, so a Letter flyer becomes a correctly
composed Instagram story instead of a badly cropped one. No model call required.

## Capability boundary

The model composes, masks, gradients, patterns and typography. It does not draw
figurative illustration well, so that is delegated to Gemini as transparent PNG. Icons
are the exception in the other direction: 24px glyphs come from Lucide as inline SVG,
because raster at that size looks muddy and cannot take the palette.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js App Router, TypeScript strict, ESM |
| Render | SVG DOM scene graph |
| Editor mechanics | Fabric v6 as a transparent shadow interaction canvas |
| AI | Cursor SDK (`@cursor/sdk`), default `gpt-5.6-sol-high-fast` |
| Raster | Gemini `gemini-2.5-flash-image` |
| Storage | IndexedDB, browser only |
| Auth | None |

## Formats

Social: Instagram square, portrait and story. LinkedIn post and square. X. Facebook
feed. YouTube thumbnail.

Print: US Letter and A4 at 300 DPI. Print presets keep their viewBox in 100-DPI design
units so the model reasons about human-scale coordinates, with export applying the 3x
scale factor.

Logo: square and horizontal canvases, exported as SVG plus transparent PNG at 512, 1024
and 2048.

## Development

Secrets resolve through the macOS Keychain broker. No `.env` file, no keys in the repo.

```bash
npm run dev
```

That wraps `next dev` in nested `secret-env` calls to compose the `cursor` and `gemini`
profiles. `secret-env` accepts a single `--profile` but spawns with
`{ ...process.env, ...childEnv }`, so nesting composes without a registry change.

Model selection is overridable via `CURSOR_CHAT_MODEL`.
