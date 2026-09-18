# Generated file preview tabs

Generated files open as individual tabs in the center workbench. Each tab shows
the file's name or output title. A second file opens a second tab; an updated file
refreshes its existing tab. Tabs can be switched and closed independently.
Closing a tab does not delete the file.

The Files tab keeps its original split layout: the file tree on the left and the
preview/editor on the right. Clicking a tree file updates the right-hand pane
inside Files. Generated files also have independent tabs, using the same shared
file document component. The complete Files workbench remains mounted while
switching tabs, preserving expanded folders, the selected file, and its draft.
Each view owns its display mode. Only the active file view mounts an editor;
inactive views keep their document state without a live editor that could steal
keyboard focus. Leaving a view commits the active cell to the in-memory draft,
and returning restores the latest shared snapshot. Cell-input document mutations
are excluded from workbook draft updates. A workbench-scoped
`FileDocumentStore`, keyed by workspace and normalized file path, shares the
saved baseline, unsaved draft, dirty flag, and save status across both entries.
Text edits propagate immediately; Office edits export to in-memory snapshots
without uploading. Switching tabs preserves unsaved changes. View mode stays
read-only without permission dialogs, while allowing selection and copy.
Only an explicit Save writes the shared draft to the workspace. Saving or
discarding updates both entries; changing view/edit mode does not save or discard.
Drafts are retained in memory for the workbench lifetime, not across page reloads. Closing or refreshing a dirty file offers save, discard, and
cancel. Incoming generated updates do not overwrite an unsaved draft.

The shared document component contains the existing `FileViewerComponent`,
including its format renderers, toolbar, editing, reference, refresh, and download
actions. Its state handles loading, authenticated downloads, saving, and temporary
URLs. Shared draft URLs are released on replacement or when the workbench is destroyed. `FileWorkbenchComponent` composes the tree and document for the Files tab
and its other consumers. Generated-file tabs embed the document component on its
own. Editing follows workspace write access and the existing supported editor
formats. External file URLs are read-only.

## Scope

This feature is implemented entirely in `xpert`. It uses existing file-output
contracts and the shared `FileDocumentComponent` / `FileDocumentState`. No plugin changes,
plugin installation credentials, or plugin reloads are required. Plugin-native
document editors and their selection behavior are outside this change.

Completed tool events containing `files` or `artifact.files`, and successful
assistant task-summary outputs with `workspace_file` or `artifact` resources,
open through the inline file preview. Native document IDs without a file output
do not create file tabs. Failed, pending, and user-uploaded outputs are excluded.

Task-summary outputs are checked after the response completes. Already seen
outputs are not reopened on the next response. The same workspace file reported
by both a tool and a summary shares one tab even when its signed URL changes or
an asset ID is assigned later. Tabs are scoped by assistant and runtime workspace.

Supported formats follow the existing shared preview; unsupported formats retain
its fallback and download link. Private workspace files use authenticated
download and temporary object URLs, which are released on replacement, close,
and component destruction. Late requests do not open in a different conversation.

Historical files can be opened by clicking their task-summary entry. Open tabs
are not persisted across a full page reload.

## Verification

1. Generate two files: two named tabs appear, each previewing its own file.
2. Update the first file: its original tab refreshes and the second stays intact.
3. Switch and close tabs; verify closing a tab does not delete its file.
4. Return the same file from a tool and a response summary: only one tab remains.
5. Preview a private file and switch conversations before another fetch returns.
6. Verify a document-only plugin response does not open a file tab.
7. Open Files: verify the tree and preview/editor appear side by side. Select a
   file and verify it opens in the right pane without switching the active tab.
8. Edit a workspace text file, switch tabs and back, then close it. Verify cancel
   keeps the draft, save persists it, and discard closes without writing.
9. Return to the file tree and verify expanded folders and selection remain.
10. Open the same XLSX in Files and an independent tab. Edit a cell in one entry,
    then switch to the other without saving: the draft and unsaved indicator match.
    Save from the other entry and verify both become clean. Repeat with Discard.
11. In View mode, try typing, double-clicking, pasting, cutting, deleting, and
    formatting. No content changes or permission dialogs should occur. Selection,
    copy, scrolling, and switching sheets remain available.
12. Switch to View during an active cell edit; keep the draft and disable further
    editing. Refresh or a late file response must not overwrite an unsaved draft.

```sh
corepack pnpm exec nx test cloud --runInBand --testPathPatterns='workbench-artifact|clawxpert-conversation-detail.component|clawxpert-conversation-files.component|files/workbench/workbench.component|files/viewer/viewer.component|files/document/file-document-state|files/spreadsheet-editor/spreadsheet-editor.component'
```
