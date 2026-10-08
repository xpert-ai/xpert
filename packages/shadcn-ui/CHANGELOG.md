# @xpert-ai/shadcn-ui

## 0.2.1

### Patch Changes

- aa33949: Show bundled Coding CLI brand logos in execution headers, project task/attempt views and resource cards. Prefer published color variants, retaining monochrome when unavailable. Project graphs expose authorized executor identity, keeping the latest implementation separate from review attempts and preserving registered business icons. Unknown tools retain generic icons; status, execution and collection mechanisms remain unchanged.

  Keep brand assets, licenses and the React component together in shadcn-ui/brand-icons. Provide a React-free data entry for server resource cards; Coding runtime identity mapping stays in its domain adapter.

- b86bba1: Preserve host-provided root font size and corner-radius variables in remote Views. Make shared React theme utilities prefer the corresponding host radius values and clamp fallback radii so compact themes remain valid.
- 49b60d4: Forward DOM refs through shared Button and PopoverTrigger components so React 18 Radix overlays anchor to the visible trigger, including composed Tooltip/Popover controls. Add regression tests for DOM ref forwarding and composed overlay triggers.

## 0.2.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.
