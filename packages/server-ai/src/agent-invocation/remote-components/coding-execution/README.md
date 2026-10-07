# Coding execution transcript

The independent execution viewer uses native browser DOM and the base stylesheet from `@webtui/css` for its transcript, with a small React header using the shared `@xpert-ai/shadcn-ui` components. It renders persisted Activity through the existing Remote View bridge. It does not start processes, provide terminal input, or update project task state.

## Presentation

- Compact header: executor, execution status, search, follow, copy and palette selector. Controls use the shared shadcn Button, Badge and Select; the palette menu supports keyboard navigation without a native select popup.
- Continuous monospace transcript: public replies, tools, commands and explicit file changes. Tools use native disclosures; commands initially show captured output and an exit code when supplied by the protocol.
- Large output initially shows up to 12 lines / 2,400 characters. Expand for loaded text; load further captured output through the existing output reference. Search and copy cover loaded records, not unrequested archive pages.
- A versioned SDK result envelope is validated with `agentTaskResultSchema`: its public summary is shown once and the original envelope appears as a collapsed JSON tree. Other valid JSON objects/arrays (including fenced JSON and invalid SDK envelopes) open the first tree level without interpreting business fields. Objects and arrays expand independently, with field/item counts and indexed array entries. Nodes are retained by property/index on updates, preserving expansion, focus and text selection. Arrow keys navigate visible nodes; search opens matching ancestors. Copy original retains the exact source; malformed JSON remains plain text. A matching final result is not repeated, including result-only historical records.
- Files retain the existing versioned authorization and Web/Desktop download path. Technical metadata is collapsed in the footer.
- `detail.type` drives command/file rendering. Display names and prose never determine a tool type. Diffs only show captured patches, not inferred changes in the shared workspace.

## Themes and typography

The selector offers **Host theme, Paper, Charcoal and Midnight** (跟随宿主、纸白、炭黑、深蓝). It defaults to Host theme. Explicit palettes change transcript-local CSS variables and leave host tokens untouched. The header and its popup continue to follow the host theme. The choice survives data refresh and same-instance context changes; it is local to the open view and is not a new account preference.

Root size uses `--xui-density-root-font-size`, falling back to **14px**. `html:root` deliberately overrides WebTUI's base root rule. The WebTUI surface uses Tailwind `text-sm` (`--text-sm`, default `0.875rem`): a 14px root produces 12.25px transcript text, and a 15px root produces 13.125px. Auxiliary labels scale relative to that text size. The header uses the host `--xui-font-family`; the transcript uses `--xui-font-family-mono` with system monospace and Chinese fallbacks. Labels follow the host locale. Shared shadcn styles and only WebTUI base CSS are imported; no OpenTUI, xterm.js or PTY is added.

`header.tsx` mounts one React root, updating props without remounting the Select or its open popup. The self-contained module bundle resolves React and React DOM to the same workspace versions, avoiding duplicate peer runtimes. The transcript stays outside this root so its incremental DOM updates remain independent.

## Stable updates

`main.ts` owns bridge requests, invocation/scope boundaries and the existing cursor polling. `view.ts` keeps one `ActivityRow` per record ID, ordered by `firstSeq` and updated only for newer `seq`. Unchanged text nodes, disclosures and controls stay mounted. Returning to the same invocation with a locale update does not clear the transcript.

When following is paused, the first visible record anchors the scroll position. Selecting text pauses follow; updates touching the selected record are deferred until selection clears, while header status continues to update. Scope or invocation changes intentionally clear the previous records and reject stale responses.

Polling continues while Activity is recording even if execution has become terminal. It stops after capture closes; visibility resume rechecks the existing cursor. Temporary read errors retain loaded content and show a retry notice. No new stream or collection mechanism is introduced.

## Keyboard and search

- `/` or Ctrl/Cmd+F inside the viewer opens search and pauses follow.
- Enter / Shift+Enter select next / previous match; Escape closes search.
- Arrow Up/Down moves between focused records; Enter toggles that record's disclosure. Native Tab and disclosure navigation still work.
- Search expands matching loaded output and uses CSS Custom Highlight ranges, preserving DOM and text selection. It shows up to 2,000 matches. The active record is also indicated when Custom Highlight is unavailable.
- Copy uses a synchronous native copy fallback for sandboxed views, retaining focus and selection. Downloads continue to request the existing scoped file grant.

## Build and verify

From the repository root:

```sh
node packages/server-ai/src/agent-invocation/remote-components/coding-execution/build.mjs
node --test packages/server-ai/src/agent-invocation/remote-components/coding-execution/view.test.mjs
corepack pnpm exec tsc --noEmit -p packages/server-ai/src/agent-invocation/remote-components/coding-execution/tsconfig.json
corepack pnpm remote-view:preview --config packages/server-ai/src/agent-invocation/remote-components/coding-execution/preview.config.mjs
```

Preview at `http://127.0.0.1:4412/` uses synthetic, non-sensitive Activity. File download deliberately requires the installed platform. Regression tests exercise the built bundle and production message bridge. Visual review and real Web/Desktop acceptance are recorded in [design-qa.md](design-qa.md) and [the implementation plan](../../../../../../docs/plans/2026-10-07-coding-cli-execution-view-implementation.md#11-webtui-过程流与主题2026-10-07).

The current CSS optimizer emits two warnings for the standard `::highlight()` pseudo-element and preserves those rules. Search highlighting was verified in Chromium and Electron.
