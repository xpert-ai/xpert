# Agent Square application-card density and hover action — design QA

## Evidence

- Source visual truth: `/var/folders/zr/dr3n4hcx5h1fr9c63_gncck40000gn/T/codex-clipboard-8ef794b1-f57a-4270-8960-9d3dc8dc8115.png` at 1164 × 860 pixels.
- Browser implementation, default state: `/tmp/xpert-agent-square-application-card-compact.png` at a 1440 × 1100 CSS/pixel viewport, device density 1.
- Browser implementation, card-hover state: `/tmp/xpert-agent-square-application-card-hover.png` at a 1440 × 1100 CSS/pixel viewport, device density 1.
- Side-by-side full and focused comparison: `/tmp/xpert-agent-square-application-card-comparison.png`.
- Responsive evidence: live browser capture at 390 × 844 CSS pixels.
- State: light theme, signed-in organization, Applications catalog selected, Factory Operations application visible.

## Findings

- No remaining actionable P0, P1, or P2 mismatch.
- The unnecessary fixed-height metadata region, minimum description height, forced tag-row height, and full-width action footer have been removed.
- Screenshot-backed cards retain the 400 px media frame, while the lower glass panel now takes only its natural content height.
- The `lg` primary action is anchored at the card's lower-right corner, hidden by default, and shown when the card is hovered or receives keyboard focus. Non-hover pointer devices keep the action visible.
- Cards without screenshots now use natural content height instead of inheriting an empty 400 px body.

## Required fidelity surfaces

- Typography: existing card title, developer, description, status, and tag type styles remain unchanged; title metadata spacing is reduced without altering hierarchy.
- Spacing and layout: panel padding is reduced from 20 px to 16 px, metadata gaps are reduced, description is clamped to two lines, and the action no longer reserves a full footer row.
- Colors and visual tokens: existing background, border, status, and glass-panel tokens are preserved; the action uses the existing primary button treatment and elevation.
- Image quality and asset fidelity: the real plugin screenshot remains full-bleed, uncropped beyond the existing `object-cover` frame, and visually dominates the card.
- Copy and content: application name, developer, summary, scope, tags, status, and primary action remain present.

## Interaction and responsive checks

- Browser default-state capture confirms the primary action is not shown until interaction.
- Browser pointer-state capture confirms the `打开应用` action appears at the lower-right without changing card dimensions or obscuring metadata.
- The action is `zSize="lg"`, remains keyboard-reachable through the card focus-within state, and is forced visible for devices matching `hover: none`.
- At 390 px, the page and featured content remain within the viewport with no new horizontal overflow.
- The Angular development build completed successfully and the browser showed no visible runtime error state.

## Comparison history

- Initial P1: the application card reserved large blank blocks between summary, tags, and a full-width footer action.
- Initial P2: the always-visible full-width action competed with the screenshot and metadata hierarchy.
- Fixes: switched the information panel to natural height, tightened inner rhythm, removed minimum heights and `mt-auto`, and converted the action to a lower-right hover/focus affordance.
- Post-fix evidence: the focused comparison shows a compact default card and the same card with the lower-right action visible, without layout shift.

## Verification

- Focused Angular/Jest suite: 19/19 passed.
- Prettier and ESLint for the touched Agent Square files: passed.
- Cloud development build and Contracts dependency build: passed.

final result: passed
