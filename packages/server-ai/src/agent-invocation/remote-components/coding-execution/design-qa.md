# Coding execution transcript — design QA

Date: 2026-10-07

**final result: passed**

## Visual truth and evidence

- Selected target: prototype 2, light continuous transcript. Source: [coding-execution-webtui-reference.png](../../../../../../docs/plans/assets/coding-execution-webtui-reference.png).
- Final browser render: [coding-execution-webtui-paper.png](../../../../../../docs/plans/assets/coding-execution-webtui-paper.png), from `http://127.0.0.1:4412/` using the production bundle and synthetic Activity.
- Source pixels: 1448 × 1086. Final implementation pixels: 1448 × 1085; browser DOM viewport 1448 × 1087, with two bottom pixels lost to fractional clip rounding. The one-pixel source/capture difference does not affect any content. IAB reports devicePixelRatio 0.75 and scales the viewport override; actual DOM dimensions and captured pixels were checked instead of assuming the requested override was CSS size. Source is a generated raster, with no authoritative CSS density.
- Same content/state: Paper palette; successful run; first file patch expanded, other file tools collapsed; command output expanded; metadata collapsed. Both images were opened together in the same comparison input after each final change.
- Additional browser renders in the protected local acceptance directory `coding-execution-webtui/screenshots`: `coal-final.png` (1024 × 768 DOM), `navy-narrow-final.png` (391 × 844 DOM), and `desktop-live.png` (real native application).
- Default font explicitly follows the user's 14px requirement. The generated reference has larger raster lettering; this is an intentional sizing constraint, not an inferred requirement to enlarge the entire application. Actual platform root font and host token were both 14px.

## Findings and comparison history

1. **Resolved P2 — tool-row density and duplicate patch heading.** Initial render left extra vertical padding around every generic tool and repeated a single file's path inside an expanded patch. Removed redundant padding and the duplicate path. The final render has a continuous compact stream with clear paragraph spacing and a single file heading.
2. **Resolved P2 — default root font.** Computed-style inspection found WebTUI's `:root` specificity winning over the initial `html` rule, producing 16px. Changed the host-variable rule to `html:root`; re-rendered and measured 14px without a host token and 14px with the actual platform token. Final light/dark/narrow captures use the corrected rule.
3. **No remaining actionable P0/P1/P2 findings.** Narrow mode wraps the header and command/patch text while keeping search, follow, copy, palette and technical information reachable. Long output scrolls inside the transcript rather than displacing the header/footer.

## Required fidelity surfaces

| Surface                 | Evaluation                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts / typography      | System monospace for the continuous stream, Chinese fallback, stronger host-font header. Chinese punctuation and mixed file paths remain readable. Host sizing overrides the 14px fallback. No forced character-grid positioning. |
| Spacing / layout rhythm | Flat document with compact tool lines, paragraph gaps and indented captured output. Header and footer remain fixed within the viewer. No return to nested cards or multi-column dashboards.                                       |
| Color / tokens          | Warm Paper baseline, semantic status and patch colors; Charcoal and Midnight preserve contrast. Host palette uses host tokens. Theme switching does not rebuild content.                                                          |
| Images / icons          | No decorative raster imagery is required by this design. Standard controls use bundled Remix Icon assets; disclosure markers are native HTML controls. No custom illustrated replacements.                                        |
| Copy / content          | Chinese labels follow the host locale. SDK result summaries appear once, with their original envelope collapsed. Output text is preserved verbatim; test checkmarks are not synthetically recolored based on string matching.     |

Full-frame captures keep the header, output, patch, file action and footer legible, so a separate magnified region was unnecessary. Actual Desktop long-output search additionally confirmed highlight positioning and Chinese rendering at the host density.

Intentional differences from the generated image: a visible palette selector and follow control; copy output next to its exit-code/output controls; localized file-operation labels; all supported tools use native disclosure affordances; root size follows the explicit 14px/host requirement. These keep the agreed continuous layout and working controls.

## Interaction and runtime acceptance

- Web: real Qwen 90-second execution moved from running to succeeded without reload; the original card updated, paused following remained paused, and Chinese output was readable. Direct runtime card and project historical execution opened the new renderer.
- Native Desktop: separate real Qwen 60-second execution moved from running to succeeded without reload; new-output indication and paused following remained. Theme switching retained expanded output. Search located Chinese record 79 in an 80-line output. Native copy followed by paste confirmed copied content.
- Existing project execution circle and task Dialog's “查看执行过程” both opened the same persisted execution in Desktop. Project status remained completed.
- Web and Desktop downloaded the existing versioned JSON through their original authorization paths; saved files both matched `{count:12, sum:78, min:1, max:12}`.
- Eight built-bundle regression tests passed: incremental IDs/revisions, focus/disclosure/scroll, selection deferral, terminal capture polling, summary deduplication, search/navigation, themes/scope boundaries, safe text rendering, copy, output paging and file requests.
- Strict TypeScript check, UI bundle build and API dependency lock checks passed. CSS optimizer retains two warnings for the standard `::highlight()` pseudo-element; actual search highlighting works in Chromium/Electron.
- Console checked after the final preview reload: no new errors. An earlier preview concatenation error was fixed with the bundle's leading semicolon; old timestamped entries were not treated as errors in the final page.

## Implementation checklist

- [x] Reproduce selected continuous transcript with compact header.
- [x] Add four palette choices and host language/font integration.
- [x] Preserve ID-based records, scrolling, disclosures, focus and selection.
- [x] Verify real Web/Desktop execution, existing entry points and downloads.
- [x] Build, typecheck, regression tests, source/render comparison and documentation.

## Follow-up polish

No blocking follow-up. Palette choice is deliberately local to the open view; persistent account-wide preferences remain outside this change. This is a captured-activity reader, so upstream truncation and missing exit codes remain visible limitations rather than fabricated terminal output.

## Header and text-sm refinement

The user's subsequent instruction replaces the prototype's header controls with shared shadcn components and sizes the WebTUI surface relative to `text-sm`. This supersedes the original header styling and transcript font scale above.

- Final render: [coding-execution-shadcn-header.png](../../../../../../docs/plans/assets/coding-execution-shadcn-header.png), Paper palette and production bundle with synthetic Activity. Header uses shared Button, Badge and Select with Lucide icons; transcript disclosures remain native.
- Computed styles in preview and the real Web iframe: root 14px, transcript 12.25px (`0.875rem`). Header follows host typography and theme; choosing Midnight changes only the transcript surface.
- Web: opened a persisted execution through the existing project entry, verified shared component data slots and the custom four-option palette listbox. Existing output and files remained available.
- Native Desktop: reopened from the existing task execution circle, verified the custom combobox/listbox and switched to Midnight. Evidence is saved in the protected local acceptance directory as `coding-execution-webtui/screenshots/desktop-shadcn-header.png`.
- Narrow preview at 391 × 844 DOM pixels: header controls wrap within the viewport, Chinese text remains readable, no horizontal page overflow. Temporary viewport override was reset after verification.
- All eight built-bundle regression tests pass, including a new assertion that an open palette popup and its focused option survive an Activity update. Header copy is also exercised. Build and strict TypeScript checks pass; no new preview console errors.
- This refinement did not start another real CLI execution. Live execution, capture and download acceptance recorded above remains the prior run; the changed header's behavior during incremental updates is covered by the regression test.

**Refinement result: passed.**

## JSON tree and task output tab follow-up

- JSON objects and arrays, including fenced JSON that fails the SDK result contract, use a per-node collapsible tree. Generic JSON opens its first level; validated SDK envelopes keep their root closed beside the public summary. Only a valid SDK envelope contributes a business summary. Eleven passing built-bundle regression tests cover indexed arrays, original copy, deep search, node retention, keyboard navigation, selection/focus/expansion preservation and duplicate-final-result suppression. The viewer strict TypeScript check passes.
- An isolated browser fixture verified the task Outputs tab displays committed files and safe export errors without history/acceptance controls. A subsequent isolated browser fixture verified multi-level JSON expansion and ArrowRight navigation into child nodes, with Chinese labels and no browser errors. It does not constitute a retry or repair of the user's failed file export.
- Both UI bundles build successfully. Coding View strict typecheck passes. The Tasks View full typecheck remains blocked by existing errors in unrelated contracts files; no diagnostics point to the changed UI files.
- Only the local UI assets were refreshed. API, Desktop, runners and business task state were not restarted or changed.
