# Drift Check

A zero-dependency design token auditor. Inspects live rendered CSS via `window.getComputedStyle()` against an editable token set to classify every property as exact, drifted, or unmapped.

**Live tool:** [https://drift-check.saadnama.com](https://drift-check.saadnama.com)

## Capabilities

- **Live computed-style audit:** Measures painted DOM values (spacing, color, typography, radius) against active tolerances rather than static annotations.
- **Interactive token controls:** Edit values inline, nudge scales with arrow keys, adjust colors via native pickers, toggle the canvas overlay (`O`), and click any token name to spotlight its usages.
- **Capture × Build matrix:** Compare synthetic UI captures across lifecycle builds (`v1.0 Clean` → `v1.4 Drift` → `v2.1 Hotfix`) in Light and Dark mode.
- **Triage cues (v1.1):** Drifted rows suggest the nearest token (`→ Use space-4 (16px)`); Unmapped rows ask `Investigate · Intentional override or missing token?` without guessing.
- **Designer discretion:** `Dismiss` a Drifted or Unmapped finding to drop it from counts and Canvas pins. Dismissed items sit under `Dismissed exceptions (N)` with `Restore`, and clear on capture/build switch or Reset defaults.
- **Copy handoff:** One click copies active findings as Markdown (capture, build, tolerance, suggested token fixes, items needing investigation, and a dismissed-exceptions note).
- **System dark-mode sync:** Follows `prefers-color-scheme: dark` live until you flip the Dark mode switch, which sets a session override. Reset defaults clears it and re-syncs.

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
