---
'@xpert-ai/shadcn-ui': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/desktop': patch
---

Preserve host-provided root font size and corner-radius variables in remote Views. Make shared React theme utilities prefer the corresponding host radius values and clamp fallback radii so compact themes remain valid.
