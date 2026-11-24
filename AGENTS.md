# Drift Check

Drift Check is a static design-token audit. Keep it a zero-dependency, four-file site. Do not add a bundler, framework, package manager, or component library.

## Files

- `index.html` — structure only. Scripts and styles use relative paths (`./styles.css`, `./sample-data.js`, `./scanner.js`).
- `styles.css` — all presentation. Every rule is scoped under `.to-app` with a `.to-` class.
- `scanner.js` — one IIFE. It scans rendered elements, classifies values, and wires the page.
- `sample-data.js` — fictional tokens, tolerance presets, captures, and builds. Exposed as `window.DRIFT_CHECK_DATA`. Clone the token list on load so Reset defaults can restore it.

Deploy only those four files. `README.md` and `AGENTS.md` stay in the workspace and are not part of the hosted site.

## Theme

Semantic variables live on `.to-app`. Dark mode is `data-theme="dark"` on `.to-app` and is stored in `localStorage` under `to-theme`. The canvas (`.to-stage`) keeps the light palette in both modes so the sample and its callouts do not change.

Status colors are two-tier Emerald / Amber / Rose:

- `--to-exact-solid` / `--to-exact-text` / `--to-exact-soft`
- `--to-drifted-solid` / `--to-drifted-text` / `--to-drifted-soft`
- `--to-unmapped-solid` / `--to-unmapped-text` / `--to-unmapped-soft`

`-solid` paints marks (rings, bars, dots, outlines). `-text` is ink for labels and off-token values. `-soft` is the hover and selection fill. Map them to `--c`, `--c-ink`, and `--c-soft` on `[data-status]`. Invalid fields use the unmapped solid and soft colors.

Spacing follows an 8px rhythm. Token names and values use monospace and tabular numbers.

## Interaction

- Token values are quiet, borderless, right-aligned fields. A hairline and focus ring appear on hover or focus. The `px` unit stays muted and tight to the number.
- Focusing a value selects all of its text. Arrow Up / Arrow Down nudge numeric tokens by 1px. Shift nudges by 4px, clamped at 0, and rescans immediately.
- The `×` remove control is invisible until the row is hovered, and stays hidden while that row's value is being edited. A column always keeps at least one token.
- `+ Add` is opacity 0 at rest and keeps its height so the column does not jump. It appears only on that column's hover or focus. On touch (`hover: none`) it stays softly visible. Enter commits a valid draft. Escape cancels it.
- New spacing, type, and radius tokens sort by pixel value. New colors append to Semantic Accents, below the hairline that separates them from Neutrals/Surfaces. Color swatches are 17px and open a native color input.
- Clicking a token name spotlights every element that resolves to that token, including exact matches while Issues only is on, and dims everything else to 35% opacity. Findings filter to that token and show a dismissible chip. Clear it by clicking the name again, the chip, switching capture or build, or pressing Escape.
- The token panel is open on load and can collapse to a summary of color dots plus `Spacing`, `Type`, and `Radius` ranges. Collapse is not persisted.
- Reset defaults returns tokens and tolerance to the original Standard set and hides itself when nothing is dirty.

## Preview matrix

Three captures (Queue Row, Publish Card, Data Row) times three builds (v1.0 Clean, v1.4 Drift, v2.1 Hotfix). Same DOM per capture. Only scanned values change. Default is Queue Row · v1.4 Drift.

Classification: exact when the value matches a token (color distance under 0.5). Drifted when it is within the active tolerance. Unmapped otherwise. Presets are Strict, Standard, and Loose. Anything else is Custom.

Do not reorder `data.tokens.color`. Display order is separate from index alignment with the saved defaults.
