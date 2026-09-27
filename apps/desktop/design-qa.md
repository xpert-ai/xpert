# Assistant profile QA — 2026-09-27

final result: passed

## Visual truth and evidence

- Selected option 2: `/Users/xpertai/.codex/generated_images/01a0d3f4-8f63-7563-8fe8-c81555492487/exec-8ee6b3a7-6f7f-4de7-9c73-085a9c91bfa9.png`.
- User amendments: remove description, version and metrics from the header; remove the fixed global conversation/edit footer; only avatar hover opens the profile, while title/description click opens the conversation. Footer reference: `/var/folders/zr/dr3n4hcx5h1fr9c63_gncck40000gn/T/codex-clipboard-ba4f9d49-b272-4bd9-b31e-8992bafec520.png`.
- Final browser-rendered evidence: `/Users/xpertai/Pro/xpert-pro/.local/computer/desktop/profile-qa/avatar-only-no-footer.png` (local-only; not bundled with source).
- Preview: `http://127.0.0.1:4390/`. Actual organization-scoped assistant with Publication activity and a populated case detail. Earlier checks covered empty Awaiting approval and populated Governance activity.
- The concept is a 1024 × 1536 design board, not a literal viewport. The amendment is a 1506 × 1410 crop with an approximately 840 × 1320 physical-pixel card, corresponding to 420 × 660 CSS pixels. The final card measures 420 × 600 CSS pixels in a 1721 × 1285 CSS viewport (reported DPR 1.5; CUA capture normalized to approximately CSS-pixel density). Compare the card region rather than surrounding application chrome.
- Earlier comparisons covered the selected source board and compact header. The footer amendment and latest capture were opened together in the same comparison input. Header actions, tabs and expanded custom content were readable at this scale, so no separate focused crop was needed.

## Comparison and findings

No remaining actionable P0/P1/P2 findings in the verified states.

- Typography: existing Desktop system font stack, semibold assistant title and compact secondary text preserve hierarchy. Conversation titles wrap to two lines; long custom tab names truncate with a full accessible name, tooltip and More entry.
- Spacing: centered identity is retained. The global footer is removed, returning approximately 65 pixels to content while keeping the card at 420 × 600 CSS pixels. Open conversation moves to the header; Edit profile moves to the avatar corner. Custom Views retain their own contextual action areas. The card aligns beyond the row's right edge even though only its avatar triggers it.
- Tokens: semantic popover/background/border/text/primary colors support the existing theme. The final preview uses its English/dark/amber configuration; the user’s native Chinese/purple configuration is preserved. This is an intentional theme/locale difference, not a claim of pixel-identical colors.
- Assets: real assistant avatar is retained, including user-selected emoji/image values, with the existing Bot icon fallback. No mock identity or mock business records were inserted.
- Copy/content: description, version and metrics disappear from the header as requested. Native and custom tabs are preserved. Counts/statuses and custom content come from authorized APIs; idle is not labeled completed. Plugin-specific contents and empty states are owned by that plugin, rather than copied from the illustrative design board.

## Comparison history and checks

1. Earlier native review found cramped Chinese custom tab space. Fixed the tab flex allocation; Chinese Governance activity and Awaiting approval then rendered and switched correctly.
2. User amendment removed three header sections. Verified the compact header in the final capture; the About/Capabilities tabs retain the detailed information.
3. Interaction verification found a stale pin lock after close and duplicate profile portals from hidden sidebar layouts. Added trigger ownership and disabled previews in the hidden layout. Rechecked one visible panel, close/reopen, Escape/reopen and expanded/collapsed transitions.
4. Verified Activity, Capabilities, About, custom tab menu, actual search/results, detail/back, empty approval state, tab state retention and Continue navigation into an existing conversation. No model messages or approval actions were submitted.
5. Browser logs checked: no profile exception; one pre-existing ChatKit client-secret refresh AbortError occurred while switching the embedded chat. Its target conversation loaded afterward.
6. Verified sustained title/description hover opens zero profile cards, then avatar hover opens exactly one. Avatar keyboard access and the profile's row-edge alignment remain available.
7. Verified the header conversation action navigates to the selected assistant; avatar edit opens the existing editor and Cancel leaves data unchanged. Confirmed no global footer and a working Publication activity detail after the change. No model message or approval action was submitted.

## Follow-up polish and limits

- P3: Long English custom-tab titles are ellipsized at this compact width; tooltip and More retain the full title.
- Native screen capture became unavailable near the final check; final geometry is verified in the same Desktop renderer via the browser preview. No claim of a final native screenshot or production-package smoke test.
- No pending business approval was available, so interaction-lock/action authorization paths are covered by host/protocol tests rather than a real approval submission.

## Implementation checklist

- [x] Avatar-only trigger, compact header actions, native/custom tabs and no global footer.
- [x] Scoped host API and isolated, revocable remote component bridge.
- [x] Loading/error/retry/empty states, keyboard access and pin lifecycle.
- [x] Live renderer checks and same-input visual comparison.
