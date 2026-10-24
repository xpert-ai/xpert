# Shared shadcn UI

React remote Views use the official **Radix Nova** preset. It shares the Nova
appearance of the Base UI examples at `https://ui.shadcn.com/docs/components/base/dialog`
while retaining this workspace's Radix interaction API.

## Upstream baseline

- Preset: `radix-nova`, Lucide icons, CSS variables enabled in `components.json`.
- Generated with the official `shadcn@4.22.1` CLI on 2026-10-24.
- Registry: `https://ui.shadcn.com/r/styles/radix-nova/{component}.json`.
- Upstream reference: `shadcn-ui/ui@ffd225775bbb7955a673f08bb9be4a63600d9dfb`.
- `src/styles/shadcn.css` contains the official state variants, accordion keyframes
  and scrollbar utility from that revision's `packages/shadcn/src/tailwind.css`.
- The upstream MIT license is retained in `LICENSE.shadcn.md`.

The 33 existing primitives follow this preset; `InputGroup` is included because
the current official Command component depends on it. Keep the official component
classes and variants together. Do not mix `new-york` components into this package
or add View-specific skins to the shared primitives.

Workspace integration changes are deliberately small: imports use the existing
`cn` helper; Button, composed triggers and overlay wrappers preserve React 18
DOM ref forwarding (the upstream code targets React 19); Tabs
continues forwarding `orientation` to Radix for vertical keyboard navigation.
These changes do not alter the official appearance.

## Theme and consumers

Import `@xpert-ai/shadcn-ui/styles.css` in the consumer's Tailwind entry and scan
its TSX sources. After receiving host tokens, call `installShadcnThemeVars` with
the host density. Host color, font and radius tokens remain authoritative; Nova
uses semantic variables such as `--popover`, `--muted`, `--border` and `--radius`.
The radius scale follows the official multiplier scale, with explicit host small,
medium and large radii taking precedence.

Compose DialogHeader, DialogTitle, DialogDescription and DialogFooter directly.
Nova owns the dialog padding, title, corner button, ring and muted footer surface.
Consumers may constrain width/height and scrolling, but should not repeat those
styles or set `p-0` on an ordinary Dialog. Rebuild consumers after updating shared
source: existing compiled remote bundles do not update merely by importing the
same package name.

## Validation

From the repository root:

```bash
corepack pnpm --dir packages/shadcn-ui test
corepack pnpm exec jest --config packages/shadcn-ui/jest.config.ts --runInBand
node --test tools/testing/shadcn-nova.e2e.mjs
```

The browser test builds the actual shared TSX and stylesheet, checks native
control states, dialog layout and focus in light/dark/compact/narrow scenarios,
and writes screenshots to `SHADCN_E2E_OUTPUT` or an OS temporary directory.

Built-in consumers (Conversation Map, Scheduler, Knowledge Workbench, Coding
Execution and Agent Results) use the same primitives and host density. The stable
DOM transcript/results renderers reuse `buttonVariants`; the transcript search
mounts the shared uncontrolled Input once to preserve its DOM identity. Domain
graph geometry, document content and transcript formatting remain View-owned.

After rebuilding each affected remote View with its `build.mjs`, run:

```bash
node --test tools/testing/builtin-views-nova.e2e.mjs
```

This exercises all five built bundles in light, dark and narrow layouts, including
dialog focus restoration, form submissions, native Select/Tabs and transcript
search. It uses synthetic data only and writes screenshots to
`BUILTIN_VIEWS_E2E_OUTPUT` or an OS temporary directory.
