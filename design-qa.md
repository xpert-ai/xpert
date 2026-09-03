# Bid Studio 初始化抽屉设计 QA

## Comparison target

- Source visual truth: user-provided annotated initialization-drawer reference.
- Rendered implementation: `design-qa-app-detail.png`
- Route: `http://localhost:4200/explore/apps/bid?plugin=%40xpert-ai%2Fplugin-bid&setup=1`
- State: authenticated organization context, Bid Studio already enabled, initialization drawer open, both required models preselected.

## Viewport and normalization

- Source pixels: `1050 × 1726`; the source is a tall drawer-only annotated crop.
- Implementation pixels: `1280 × 720`.
- Implementation CSS viewport: `1280 × 720`; browser device pixel ratio: `2`; the in-app browser capture is normalized to CSS-pixel dimensions.
- The source and implementation are not the same outer crop. Comparison therefore focuses on the visible 520px initialization drawer regions named by the annotations and does not claim pixel-precise equality for unrelated vertical spacing.

## Full-view comparison evidence

- The rendered drawer preserves the source hierarchy: title, app icon, initialization summary, three resource steps, model configuration, data-scope notice, and persistent footer.
- The model configuration is no longer wrapped in an additional bordered card.
- The primary and secondary footer actions share one two-column row and remain fully visible at the bottom of the drawer.
- The implementation uses the product's existing foreground, border, muted-background, radius, and button tokens; the app icon remains the plugin-provided Bid Studio asset.

## Focused region comparison evidence

- Model configuration: both fields render through the shared `copilot-model-select` component. The Embedding selector is constrained to `TEXT_EMBEDDING`; the visual selector is constrained to `LLM` models with the `VISION` feature. The opened Embedding menu showed provider grouping, search, capabilities, and the expected `multimodal-embedding-v1` option.
- Footer: “打开应用/应用到当前组织” and “取消” render at equal width in one row. Cancel closes the drawer, and “查看初始化详情” reopens it.
- A separate cropped image was not required because the complete model and footer regions are legible in the full implementation capture and were compared together with the source in the same visual input.

## Required fidelity surfaces

- Fonts and typography: hierarchy, weights, line wrapping, and compact control text are consistent with the existing Xpert design system; no actionable mismatch.
- Spacing and layout rhythm: removed the redundant model card, retained clear 20px field rhythm, and changed the footer to an equal two-column layout; no overflow or hidden persistent controls.
- Colors and visual tokens: existing semantic background, border, foreground, muted, and primary button tokens are used throughout.
- Image quality and asset fidelity: the plugin-provided Bid Studio icon is preserved with no placeholder, emoji, or reconstructed asset.
- Copy and content: source labels, initialization summary, steps, model labels, data-scope copy, and actions are preserved. The enabled-instance primary label correctly resolves to “打开应用”.

## Findings

- No actionable P0, P1, or P2 findings.
- Acceptable product-system difference: `copilot-model-select` is visually denser than the legacy native select shown under the source annotation, because the requested shared component also exposes provider identity, clearing, capabilities, and parameter controls.

## Open questions

- None for the requested adjustment.

## Comparison history

- Iteration 1: compared the annotated source and browser-rendered implementation together. No P0/P1/P2 differences were found, so no post-comparison visual fix iteration was required.

## Primary interactions and runtime checks

- Opened the Embedding Copilot model menu and verified filtered model choices.
- Closed and reopened the initialization drawer.
- Reloaded the final `localhost` route and confirmed no new console errors. Two retained errors in the browser log came from an earlier failed `127.0.0.1` origin check and were not reproduced on the final route.
- Targeted model-ID contract tests: 3 passed.
- Cloud development build: passed.

## Implementation checklist

- [x] Remove the redundant model-area card.
- [x] Reuse `copilot-model-select` for Embedding and visual models.
- [x] Preserve the existing initialization API model-ID contract.
- [x] Put primary and secondary footer actions in one row.
- [x] Verify selector, drawer, console, test, and build behavior.

## Follow-up polish

- None required for this change.

final result: passed
