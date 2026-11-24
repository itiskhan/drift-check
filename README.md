# Drift Check

A zero-dependency design token auditor. Inspects live rendered CSS via `window.getComputedStyle()` against an editable token set to classify every property as exact, drifted, or unmapped.

**Live tool:** [saadnama.com/drift-check](https://saadnama.com/drift-check/)

## Capabilities

- **Live computed-style audit:** Measures painted DOM values (spacing, color, typography, radius) against active tolerances rather than static annotations.
- **Interactive token controls:** Edit values inline, nudge scales with arrow keys, adjust colors via native pickers, toggle the canvas overlay (`O`), and click any token name to spotlight its usages.
- **Capture × Build matrix:** Compare synthetic UI captures across lifecycle builds (`v1.0 Clean` → `v1.4 Drift` → `v2.1 Hotfix`) in Light and Dark mode.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page structure and controls |
| `styles.css` | `.to-` scoped layout and two-tier Light/Dark semantic tokens |
| `scanner.js` | Computed-style scanning, tolerance classification, overlay, and interaction |
| `sample-data.js` | Synthetic tokens, tolerances, captures, and lifecycle builds |

No build step, package manager, or framework. Inter loads when the network is available and falls back to the system font offline. `AGENTS.md` documents the project's architectural and UI constraints for reproducible AI-assisted iteration.

## Run locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8080