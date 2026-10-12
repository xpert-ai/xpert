---
'@xpert-ai/desktop': patch
---

Fix Desktop dialog background flicker during foreground hover animations by blurring the background content instead of sampling it through a fullscreen backdrop filter. Preserve live background blur, nested dialog layering and card glass effects, and restore the unfiltered background when dialogs close.

Pause pointer-following avatars behind modal dialogs without resetting their pose, resume them when uncovered, and avoid redundant SVG transform updates. Add regression coverage for modal visibility, foreground avatars and animation cleanup.
