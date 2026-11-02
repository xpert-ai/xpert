# @xpert-ai/headless-ui

Shared UI package for Angular applications.

## What lives here

- Default design tokens and theme CSS in `src/styles.css`
- Reusable standalone components in `src/lib/components`
- Remaining compatibility UI primitives in `src/lib/ui/compat`
- Shared utilities in `src/lib/utils`
- Public exports from `src/public-api.ts`

The package ships with an independent default theme. Host applications may override the CSS token contract after importing the package styles.

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

## Date and time picker

Import `ZardDateTimePickerComponent` for a combined calendar and 24-hour clock. It supports reactive forms, `ngModel`, or `[(value)]`; use one binding style per instance. Values are local wall-time strings in `YYYY-MM-DDTHH:mm` format. An empty string means no selection, and a form reset to `null` is displayed as empty. The component does not perform UTC conversion or apply business rules such as an expiry being later than a start time.

```ts
import { FormControl } from '@angular/forms'
import { ZardDateTimePickerComponent } from '@xpert-ai/headless-ui'

readonly scheduledAt = new FormControl('2026-10-31T17:37', { nonNullable: true })
```

```html
<z-date-time-picker
  [formControl]="scheduledAt"
  label="Scheduled time"
  [clearable]="true"
  clearLabel="Clear scheduled time"
/>
```

Add the component and `ReactiveFormsModule` to the consuming standalone component's imports. Optional inputs are `label` (accessible field name), `placeholder`, `clearable`, `clearLabel`, `disabled`, and `class`. Form-disabled state and the `disabled` input are combined. Edits stay in the popup until Confirm or Clear; Escape discards the draft and restores trigger focus. The popup works inside CDK Dialogs and on ordinary pages. Host applications register `provideZard()` for overlay event handling.

`ZardTimeDialComponent` can also be used separately with `[value]` / `(valueChange)` using `HH:mm` strings and `[disabled]`. It supports pointer selection/dragging, one-minute precision and arrow-key adjustment.

Shared labels use the `xp-ui:dateTimePicker.*` namespace through `UiI18nService`. Configure a `UiI18nAdapter` or load the shipped `i18n/en.json`, `i18n/zh-Hans.json` and `i18n/zh-Hant.json` under the `xp-ui` namespace in i18next. English defaults are available without an adapter. Field names and domain-specific clear labels belong to the consuming application.
