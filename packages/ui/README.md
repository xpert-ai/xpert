# @xpert-ai/headless-ui

Shared UI package for Angular applications in this workspace.

## What lives here

- Design tokens and theme CSS in `src/styles.css`
- Reusable standalone components in `src/lib/components`
- Shared utilities in `src/lib/utils`
- Public exports from `src/public-api.ts`

## Tailwind and ZardUI

- This package uses Tailwind CSS v4 tooling (`tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/cli`) for ZardUI generation.
- Existing workspace apps still run with their current Tailwind setup.
- Zard components were added with:
  - `pnpm dlx @ngzard/ui add button -c packages/ui -p src/lib/components`
  - `pnpm dlx @ngzard/ui add input dialog -c packages/ui -p src/lib/components`

## Use in apps

1. Add the global UI styles to the app build styles list:
   - `packages/ui/styles.css` (workspace source mode)
   - or `@xpert-ai/headless-ui/styles.css` (package consumption mode)
2. Ensure Tailwind content scanning includes `packages/ui/**/*.{ts,html}`.
3. Import components from `@xpert-ai/headless-ui` in Angular code.
