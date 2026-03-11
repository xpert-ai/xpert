# Migration Guide

## Purpose

This document defines the repo-wide migration rules for moving UI code away from Angular Material and Material compat layers toward Zard and repo-owned headless components.

It is intentionally generic. `input/form` is only the first completed migration family and should be treated as an example of the general process, not as the whole guide.

## Target Architecture

UI migration should converge on this layering:

- `packages/ui`: source of truth for low-level Zard primitives and direct official component integrations
- `packages/angular/**`: repo-owned Angular wrappers that preserve business-facing APIs and adapt primitives to existing app usage
- `apps/**`, `libs/**`, `legacies/**`: feature code should consume wrappers or exported primitives, not raw Angular Material components

General rule:

- New UI primitives go into `packages/ui`
- Shared adaptation logic goes into `packages/angular`
- Feature code should be the last layer to change

## Core Principles

- Migrate by component family, not by random file.
- Migrate from inside out: primitive first, shared wrapper second, feature pages last.
- Preserve external business APIs when possible; prefer changing internals over forcing app-wide API rewrites.
- Prefer official Zard components when available.
- If no direct Zard equivalent exists, introduce or keep a repo wrapper and swap the implementation under it.
- Do not add new Angular Material dependencies in new code.
- Do not rely on Material DOM structure or MDC class names in migrated code.
- Remove completed Material dependencies from the same template scope; do not keep mixed ownership longer than necessary.

## Migration Decision Tree

For each component family, choose one of these paths:

1. Official Zard equivalent exists.
Use the official component in `packages/ui`, export it, and migrate callers onto it.

2. Official Zard equivalent is partial.
Build or keep a wrapper in `packages/angular` that preserves the current repo API while using Zard internally.

3. No Zard equivalent exists yet.
Keep the current wrapper, but isolate Material usage behind it and avoid expanding the Material surface area.

4. The family is tightly coupled to Material-specific control contracts.
Do not force a premature rewrite. Record the blocker, limit churn, and migrate surrounding inputs/actions/styles first.

## Standard Workflow

For every component family, follow this order:

1. Inventory current usage.
Find templates, modules, wrappers, styles, stories, and Formly integrations.

2. Define the target primitive or wrapper.
Decide whether the family will map to:
- an official Zard component in `packages/ui`
- an existing repo primitive in `@xpert-ai/headless-ui`
- a transitional wrapper in `packages/angular`

3. Land the primitive in `packages/ui`.
If the official Zard component exists, add it there first and normalize imports/exports for this repo.

4. Export from `packages/ui`.
Update:
- [packages/ui/src/lib/components/index.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/index.ts)
- [packages/ui/src/public-api.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/public-api.ts)

5. Migrate shared wrappers.
Update `packages/angular/common`, `packages/angular/controls`, `libs/formly`, shared app components, and similar reusable layers before feature pages.

6. Migrate feature templates.
After wrappers are stable, update `apps/**`, `libs/**`, and `legacies/**`.

7. Remove obsolete Material imports, types, and styles.
This includes Angular modules, type imports, compat selectors, and MDC class overrides.

8. Validate with static search and targeted builds.

## Adding Official Zard Components

When the official Zard component exists, add it in `packages/ui`.

Preferred approach:

```sh
cd packages/ui
pnpm dlx @ngzard/ui@latest add <component>
```

Fallback if the package name differs in upstream docs:

```sh
cd packages/ui
pnpm dlx zard-cli@latest add <component>
```

After generation:

- move or normalize generated files under `packages/ui/src/lib/components/<component>`
- normalize imports to repo style
- export from component index and package public API
- do not depend on app-only files such as generated `app.config.ts`

## Wrapper Strategy

A wrapper should be used when:

- the repo already exposes a stable API used in many places
- the Zard primitive does not match existing data shape or behavior
- the feature family needs repo-specific labels, density, data adapters, or value helpers

Wrapper rules:

- keep existing public inputs/outputs when reasonable
- change implementation internals first
- move Material-only types to repo-owned aliases
- prefer composition over Material inheritance
- keep wrapper templates Tailwind-first

## Import Rules

General import rule:

- feature scopes should import repo primitives or wrappers, not Material UI modules

Standalone component:

```ts
@Component({
  standalone: true,
  imports: [
    CommonModule,
    SomeRepoPrimitiveOrWrapper
  ]
})
```

NgModule:

```ts
@NgModule({
  imports: [
    CommonModule,
    SomeRepoPrimitiveOrWrapperModule
  ]
})
```

Important:

- if a migrated template uses a new primitive, its scope must import that primitive
- do not leave the old Material module in the same scope after migration is complete
- avoid temporary selector-compat shims such as `[matInput]`; migrate callers to the real new selector

## Type Migration Rules

Do not keep feature code importing Material types once a family is migrated.

Instead:

- define repo-owned aliases in shared model files
- update wrappers and features to use those aliases

Current example:

- [packages/angular/core/models/appearance.ts](/Users/xpertai03/GitHub/xpert/packages/angular/core/models/appearance.ts)

Pattern:

- Material type import in app/shared code -> repo-owned type alias
- repo-owned type alias -> used by wrappers and features

This prevents Material from remaining the source of truth for shared APIs.

## Template Migration Rules

For any family:

- replace Material tags/directives with repo or Zard equivalents
- preserve feature intent, not Material syntax
- move helper, error, prefix, suffix, trigger, and projected content into explicit wrapper slots/directives
- do not recreate Material-specific DOM structure if the new primitive does not need it

When a direct replacement is not possible:

- migrate the wrapper first
- keep the feature template API stable
- document the remaining exception in this file

## Styling Rules

Migrated styles must not depend on Material internals.

Avoid:

- `.mat-*`
- `.mat-mdc-*`
- `.mdc-*`
- Material-only CSS variables used purely for component rendering

Preferred replacements:

- component host classes
- explicit repo classes
- attribute selectors such as `[z-input]`
- Tailwind utility classes in templates
- repo-owned CSS variables in `packages/ui`

Rule of thumb:

- if a style selector contains framework implementation details rather than repo intent, it should be rewritten

## Compatibility Rules

Compatibility is allowed only when it reduces migration cost without preserving Material as a dependency source.

Good compatibility:

- repo-owned wrapper still exposes old input names
- repo-owned type alias keeps old value set
- wrapper accepts legacy values but maps them into the new primitive

Bad compatibility:

- keeping Material modules in migrated scopes
- adding new code against deprecated Material selectors
- preserving old directive names such as `matInput`
- depending on Material DOM classes for layout

## Validation Rules

For every family, verify three things:

1. Template migration is complete.
Search for the old tag/directive/module/type usage.

2. Imports are cleaned up.
The new primitive is imported where used, and old Material imports are gone for the migrated family.

3. Build still succeeds.
Run targeted builds close to the changed surface.

Useful commands:

```sh
rg -n "<mat-|\\bmat[A-Z]" apps packages libs legacies
rg -n "Mat[A-Z].*Module|@angular/material/" apps packages libs legacies
rg -n "\\.mat-|\\.mat-mdc-|\\.mdc-" apps packages libs legacies
pnpm nx build ui
pnpm nx build cloud
```

For a specific family, narrow the search pattern to that family's selectors, modules, types, and styles.

## Recommended Rollout Order

Use this order for most families:

1. Primitive in `packages/ui`
2. Shared wrapper in `packages/angular`
3. Formly/shared field types if relevant
4. Shared app components
5. Feature pages
6. Stories and demos
7. Static/style cleanup
8. Build verification

This order minimizes churn and avoids rewriting feature pages multiple times.

## Known Repo-Level Build Blockers

These are currently unrelated to the `input/form` migration but can block aggregate build targets:

- `duckdb:build` fails with `TS5090`
- `echarts:build` fails with `TS5090`
- `packages/copilot/package.json` is missing
- `packages/ngx-echarts/ng-package.json` is missing

Because of these blockers, aggregate targets such as `ocap-angular`, `formly`, or `story-angular` may fail before reaching the migrated code.

## How To Extend This Document

For every completed family, add a short family record with:

- target primitive or wrapper
- canonical tag/directive/module/type mapping
- special migration rules
- known exceptions
- validation commands

Keep the generic rules above stable. Add family-specific details below.

## Family Record: Input And Form

### Target

Input and form-field migration is based on:

- [packages/ui/src/lib/components/form/form.component.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/form/form.component.ts)
- [packages/ui/src/lib/components/form/form.imports.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/form/form.imports.ts)
- [packages/ui/src/lib/components/form/form.variants.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/form/form.variants.ts)

### Canonical Mapping

- `<input matInput>` -> `<input z-input>`
- `<textarea matInput>` -> `<textarea z-input>`
- `<mat-form-field>` -> `<z-form-field>`
- `<mat-label>` -> `<z-form-label>`
- `<mat-error>` -> `<z-form-message zType="error">`
- `matPrefix` -> `zFormPrefix`
- `matSuffix` -> `zFormSuffix`
- `MatInputModule` -> `ZardInputDirective`
- `MatFormFieldModule` -> `...ZardFormImports`

### Shared Type Mapping

- `MatFormFieldAppearance` -> `NgmFieldAppearance`
- `FloatLabelType` -> `NgmFloatLabel`
- `ThemePalette` used for input/form color -> `NgmFieldColor`

### Special Rules

- `z-form-field` accepts compatibility inputs such as `appearance`, `displayDensity`, `floatLabel`, `color`, and `hideRequiredMarker`
- compatibility exists to preserve repo APIs, not to preserve Material rendering
- `floatLabel` is compatibility-only and does not reproduce Material floating animations
- compact embedded search-like fields should use `zBorderless` when the container already renders the shell

### Formly Notes

For Formly textareas and JSON editors:

- remove `MAT_INPUT_VALUE_ACCESSOR`
- replace `mat-error` with `z-form-message`
- import `TextFieldModule` if autosize directives are used

### Static Checks

```sh
rg -n "\\bmatInput\\b|MatInputModule|@angular/material/input|MAT_INPUT_VALUE_ACCESSOR" apps packages libs legacies
rg -n "<mat-form-field|<mat-label|<mat-error|\\bmatSuffix\\b|\\bmatPrefix\\b" apps packages libs legacies
rg -n "\\.mat-input-element|\\.mat-mdc-input-element" apps packages libs legacies
```

### Validation Status

Validated during migration:

- `pnpm nx build ui`
- `pnpm nx build cloud`

## Family Record: Tabs

### Target

Tab-group migration is based on:

- [packages/ui/src/lib/components/tabs/tabs.component.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/tabs/tabs.component.ts)
- [packages/ui/src/lib/components/tabs/tabs.imports.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/tabs/tabs.imports.ts)
- [packages/ui/src/lib/components/tabs/tabs.variants.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/tabs/tabs.variants.ts)

This family covers:

- `mat-tab-group`
- `mat-tab`
- `mat-tab-nav-bar`
- `mat-tab-link`
- `mat-tab-nav-panel`

### Canonical Mapping

- `<mat-tab-group>` -> `<z-tab-group>`
- `<mat-tab>` -> `<z-tab>`
- `<ng-template matTabLabel>` -> `<ng-template zTabLabel>`
- `<ng-template matTabContent>` -> `<ng-template zTabContent>`
- `<nav mat-tab-nav-bar>` -> `<nav z-tab-nav-bar>`
- `mat-tab-link` -> `z-tab-link`
- `<mat-tab-nav-panel>` -> `<z-tab-nav-panel>`
- `MatTabsModule` in group-family scopes -> `...ZardTabsImports`
- `MatTabGroup` ViewChild references -> `ZardTabGroupComponent`

### Shared Type Mapping

- `MatTabHeaderPosition` -> `NgmTabHeaderPosition`

### Special Rules

- `z-tab` supports both plain `label` text and projected header content via `zTabLabel`
- `zTabContent` is the lazy-content replacement; when absent, the default tab body content is used
- `selectedIndex`, `selectedIndexChange`, and `selectedTabChange` should be treated as the canonical controlled-tab API for migrated wrappers
- `preserveContent` keeps previously activated panels mounted; without it, only the active panel is rendered
- `realignInkBar()` remains available as a compatibility method for callers that already trigger tab realignment after resize or drawer open
- `disableRipple`, `animationDuration`, `color`, and `fitInkBarToContent` are compatibility-only inputs; they preserve API shape, not Material visuals
- `headerPosition: 'above' | 'below'` is the repo-owned replacement for Material header position values in shared APIs
- `stretchTabs` should be used instead of Material-specific attributes such as `mat-stretch-tabs`
- nav-bar routing tabs should use `z-tab-nav-bar`, `z-tab-link`, and `z-tab-nav-panel`; `active` remains the compatibility input for route-driven tabs
- migrated styles must target repo-owned classes such as `z-tab-group__nav`, `z-tab-group__trigger`, `z-tab-group__panel`, `z-tab-nav-bar`, `z-tab-link`, and `z-tab-nav-panel`, not `.mat-tab*` or `.mdc-tab*`

### Static Checks

```sh
rg -n "<mat-tab-group|<mat-tab(\\s|>)|\\bmatTabLabel\\b|\\bmatTabContent\\b|\\bMatTabGroup\\b|\\bMatTabHeaderPosition\\b|mat-tab-nav-bar|mat-tab-link|mat-tab-nav-panel" apps packages libs legacies
rg -n "MatTabsModule|@angular/material/tabs" apps packages libs legacies
rg -n "\\.mat-tab|\\.mat-mdc-tab|\\.mdc-tab" apps packages libs legacies
```

### Validation Status

Validated during migration:

- `pnpm nx build ui`
- `pnpm nx build cloud`

Validation notes:

- the tab-group selector/type search returns zero matches for migrated scopes
- `MatTabsModule` and `@angular/material/tabs` should be fully removed after the nav-bar migration is complete
- `.mat-tab*`, `.mat-mdc-tab*`, and `.mdc-tab*` should no longer be used for tabs styling
- `pnpm nx build story-angular` is still blocked by unrelated repo issues listed above

## Family Record: Divider

### Target

Divider migration is based on:

- [packages/ui/src/lib/components/divider/divider.component.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/divider/divider.component.ts)
- [packages/ui/src/lib/components/divider/divider.variants.ts](/Users/xpertai03/GitHub/xpert/packages/ui/src/lib/components/divider/divider.variants.ts)

### Canonical Mapping

- `<mat-divider>` -> `<z-divider>`
- `MatDividerModule` -> `ZardDividerComponent`
- `vertical` -> `vertical` compatibility input on `z-divider`
- `ngmAppearance="dashed"` on divider -> `zVariant="dashed"`

### Special Rules

- `z-divider` defaults to Material-like spacing behavior: no implicit outer margin
- orientation is exposed through `data-orientation="horizontal|vertical"`; migrated styles should target that instead of `.mat-divider-horizontal` or `.mat-divider-vertical`
- vertical dividers render with the left border in the repo primitive, so migrated custom styles should change border width/color on the left side, not the right side
- divider rendering should use repo or theme tokens such as `var(--border)`; do not keep `--mat-divider-color`
- local spacing and sizing should remain in template classes or feature styles, not in the primitive default

### Static Checks

```sh
rg -n "<mat-divider|\\bMatDividerModule\\b|@angular/material/divider|\\bMatDivider\\b" apps packages libs legacies
rg -n "\\.mat-divider|mat-divider-horizontal|mat-divider-vertical|--mat-divider-color|mat-divider-color" apps packages libs legacies
```

### Validation Status

Validated during migration:

- `pnpm nx build ui`
- `pnpm nx build cloud`
