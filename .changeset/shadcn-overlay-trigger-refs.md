---
'@xpert-ai/shadcn-ui': patch
---

Forward DOM refs through shared Button and PopoverTrigger components so React 18 Radix overlays anchor to the visible trigger, including composed Tooltip/Popover controls. Add regression tests for DOM ref forwarding and composed overlay triggers.
