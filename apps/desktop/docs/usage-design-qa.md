# Usage design QA — 2026-10-03

final result: passed

## Integer points and empty deduction follow-up

- All points use localized integer formatting with rounding, including balances, periods, daily data, rankings, deductions, chart axes and tooltips. Calculations retain original precision; percentage labels retain two decimal places. The chart uses integer tick intervals.
- Verified native period values display `161,023` and `3,877`, and analytics/rankings display integer points.
- Authorized API checks in the same user/organization and 30-day range returned 200 for membership, overview, summaries and entries. Both unfiltered and selected Assistant deduction lists were empty while overview contained consumption. Source inspection confirms overview includes model usage facts, but personal detail endpoints only query debit sources. General model usage ledger access requires a separate monitoring permission.
- Empty deductions now explain the distinction and offer clear-filter/analytics actions, replacing the empty split view and disabled paging. Ranking copy explicitly describes the destination as deductions, and the renderer limits rankings to five rows even when the API returns more.
- Verified the real Assistant ranking-to-deductions flow. Screenshot: `.local/desktop-usage/qa/native-deduction-empty-explained.png`. TypeScript/Vite build, 19 usage/i18n tests and whitespace checks passed.

## Points-only follow-up

- User requested that usage quantities be shown only as points. Removed Token totals, the chart metric switch, daily/ranking Token columns, and Token fields from the deduction inspector and individual entries. Charts and accessibility labels now always describe points; removed unused Token search keywords and translations. Existing backend statistics remain unchanged.
- Verified the real Electron analytics page, expanded daily data and populated model ranking. Verified populated deduction summaries and individual entries in the isolated fixture preview. No Token quantities remain visible in these screens.
- Current screenshots: `.local/desktop-usage/qa/native-analytics-points-only.png` and `details-points-only.png`. These supersede the earlier analytics and detail captures.
- Validation: 19 usage/i18n tests, TypeScript/Vite build and whitespace checks passed. No installer was produced.

## Native follow-up — tabs and apparent 403

- Corrected the tab list to use the shared `line` variant. Removed the default selected shadow and duplicate border treatment; the primary-colored underline now sits on the divider. Verified in the running Electron window with the user's theme.
- Confirmed the actual native app uses the local API, despite a separate default profile pointing at the cloud. The selected organization is authorized, and direct membership/periods/overview requests returned 200.
- The running Electron process predated the new usage host methods. Its IPC allowlist returned `Unsupported operation.` with status 403 before any API request. Previously `HostError` discarded that machine-readable key, so the usage screen misreported it as organization access denial.
- `HostError` now preserves the key. Verified in the old native process that the message becomes an explicit restart instruction. Exited and restarted the same development launcher with its existing profile; the authenticated native app then displayed real membership, periods, usage totals and the legitimate empty deduction state. No permissions, API process or account settings were changed.
- Native screenshots: `.local/desktop-usage/qa/native-overview-fixed.png` and `native-analytics-fixed.png`. These supersede the earlier renderer-only limitation for development-app verification; no installer was produced.
- Follow-up validation: 19 usage/i18n tests, TypeScript/Vite build and `git diff --check` passed.

## Scope and visual truth

User-approved Product Design screens: overview, analytics and deduction details. Original reference images are retained with the local design session, outside the repository.

Final evidence is local-only under `.local/desktop-usage/qa/`: `overview.png`, `analytics.png`, `details.png`, `analytics-dark.png`. These are the production settings components with labeled fixture data, not real balances.

Each reference and the corresponding rendered capture were opened in the same comparison input. The reference boards are approximately 1488 × 1058; the final browser viewport is 1325 × 1227 CSS pixels, with captures normalized by CUA to approximately CSS-pixel density. Comparison is by content region and hierarchy, not a claim of pixel-identical global geometry. Attempts to override the viewport produced invalid screenshot scaling; those captures were replaced. Temporary viewport/CDP overrides were cleared. The 860 × 640 minimum window was checked separately through DOM geometry and interaction.

## Comparison and adjustments

- The three tabs, settings entry, amber selection, plan progress, separate personal balance, teal daily chart and master/detail deductions follow the approved design.
- Existing desktop typography, sidebar width, spacing, theme tokens and icons are retained. Point quantities use localized integers with grouping separators. Neutral status labels reflect API values. No custom media assets are needed.
- Scope and UTC range are placed consistently above the tab content. The illustrative date control is read-only because only 7/30-day selection is implemented.
- The model selector is an exact-name filter, with additional direct navigation from rankings. The existing API does not provide a complete model catalog for the selected range.
- Deduction source is shown for each ledger entry because a group can contain both plan and personal deductions. The page uses five summary rows, matching the reference density, and separately paginates detailed entries.
- Fixed the daily bucket range to UTC to match server aggregation. Fixed dialog close focus restoration. Replaced ECharts' generated index-heavy accessibility text with a clear metric name and a readable daily data table.
- No remaining actionable P0/P1/P2 findings in the verified states. P3: long dates and model names wrap in narrow table columns, with horizontal scrolling available inside tables where needed.

## Verification

- Desktop tests: 201 passed with `NODE_OPTIONS=--experimental-strip-types`; plain Node 22.17.1 cannot parse TypeScript imports in five pre-existing test files. After final fixture/chart adjustments, the 19 usage/i18n tests were rerun and passed.
- Production TypeScript/Vite build passed. Usage/chart code is a separate lazy chunk. The existing main application bundle still emits Vite's >500 kB advisory.
- Verified overview, benefits dialog, Escape and focus return, 7/30-day range, all three ranking dimensions, model drill-down, clear filter, row selection, summary first/last-page boundaries and disabled controls. The original metric switch was subsequently removed by the points-only follow-up above.
- Verified empty analytics and deductions, 403, 404, no membership, unlimited allowance without a percentage bar, light/dark theme and 860 × 640 responsive stacking with no panel horizontal overflow.
- Browser console check showed no warnings or errors. Credentials stay in the host. Unit tests cover foreign scope rejection, malformed responses, null-dimension grouping and stale organization responses.
- Authorized real API read-only validation passed for membership, periods, overview and summaries. The organization had no deduction rows; populated detail pagination is fixture-tested. The protected local receipt is not source-controlled.
- No packaged/native application smoke test or deployment was performed. Scope and reproduction steps: [usage.md](usage.md).
