# Shared Files: Background and Design Principles

This folder is the generic file browsing and editing foundation for the Cloud app. It is intentionally not skill-specific, project-specific, or repository-specific.

The main goal is to let different features reuse the same file workspace UX while changing only their data source. If one screen exposes a `TFileDirectory[]` tree and `TFile` content, it should usually reuse this folder instead of building another tree/editor stack.

## Why this exists

Before this split, file browsing logic was too easy to couple to a single feature page. That makes later reuse expensive because every new page tends to copy:

- tree rendering
- file preview/editor switching
- dirty-state protection
- default file selection
- lazy directory expansion
- editable/read-only policy

The shared/files layer centralizes those behaviors once so feature pages can stay focused on business context such as search, metadata, installation actions, permissions, or page-specific layout.

## Architectural split

The folder is intentionally separated into three levels:

- `tree/`
  Pure file tree presentation. It renders prepared nodes and emits user intent such as select or expand. It should not know where data comes from.

- `viewer/`
  Pure file content presentation. It switches between markdown preview, readonly code view, and editable code view. It should not decide how files are fetched or saved.

- `workbench/`
  Generic orchestration. It owns tree loading, file loading, save/discard flow, dirty guards, default selection policy, and mobile pane switching.

This split matters because not every future screen needs the full workbench. Some pages may want only the tree, only the viewer, or a custom shell around both. The workbench is the default integration layer, not the only layer.

## Responsibility boundaries

Keep these boundaries strict:

- Shared components own generic file interaction behavior.
- Feature pages own business metadata and page-level actions.
- API differences should be expressed through loader functions, not by cloning components.
- Feature-specific labels and wording should stay outside shared components unless the wording is truly generic to all file workspaces.

Examples of logic that belongs in shared/files:

- flattening and rendering a file tree
- opening a file from a selected node
- save/discard confirmation before navigation
- deciding whether a file is editable
- consistent markdown vs code rendering behavior

## Data contract principle

This layer is built around the existing shared contracts:

- `TFileDirectory` for tree nodes
- `TFile` for file content

The important design choice is to reuse those contracts instead of introducing another frontend-only file DTO. That keeps the client and server aligned and makes it easier to reuse the same UI across different APIs.

The tree helpers add only UI state on top of `TFileDirectory` through `FileTreeNode`:

- `expanded`
- `level`
- `levels`

Those fields are view state, not API state.

## Loader abstraction principle

The workbench does not hardcode any backend service. Instead, it accepts loader functions:

- one for listing files
- one for loading file content
- one for saving file content

Those loaders may return a plain value, a `Promise`, or an `Observable`. The workbench normalizes them internally so feature pages can adapt to whichever async style their service already exposes.

This is the main reuse mechanism. If another feature has a different API route but returns the same file contracts, it should pass different loaders rather than fork the UI.

## Tree loading model

The tree is designed for lazy expansion.

Important invariant:

- `hasChildren === true` means the node is a directory.
- `children === null` means the directory exists but has not been loaded yet.
- `children === []` means the directory was loaded and is empty.

That distinction is important. Lazy loading in the workbench depends on it. If a feature returns empty arrays for unloaded folders, expansion requests will never fire.

## Default selection policy

The workbench applies a stable default file heuristic after loading a root tree:

1. Prefer `SKILL.md`
2. Otherwise prefer the first editable text file
3. Otherwise prefer the first file found

This keeps the experience predictable and avoids each feature inventing a different initial-selection rule.

## Editing policy

Editability is intentionally centralized in the workbench.

By default, editing is allowed only for a fixed text-oriented extension set. Markdown files also get a dedicated preview mode. Non-text or unsupported files remain readonly.

Why this policy lives here:

- consistency across features
- fewer accidental binary-edit flows
- fewer backend-specific checks leaking into page code

If a feature needs a different policy, it should override the extension inputs on the workbench instead of patching the viewer directly.

## Dirty state principle

Unsaved changes are treated as workspace-level state, not page-local convenience state.

That means:

- switching files should not silently drop edits
- switching the active root should not silently drop edits
- feature pages should call into the workbench guard instead of re-implementing their own confirmation flow

This is one of the highest-value reasons to reuse the workbench instead of composing ad hoc tree and viewer behavior.

## Root identity boundary

`rootId` is treated as the identity of the active file workspace.

When `rootId` changes, the workbench resets:

- loaded tree
- active file
- draft content
- loading state
- pending dirty-navigation action

This avoids stale state leaking from one logical workspace into another.

## Sizing principle

`FileTreeComponent` supports `zSize` presets, but the sizing model is intentionally simple. It uses a small preset map instead of a deep slot-level design-system variant matrix.

Reason:

- this component is a shared product component, not a low-level design-system primitive
- consumers only need a few density presets
- simpler size presets are easier for AI and humans to extend safely

The workbench exposes the tree size as `treeSize` and passes it down to the tree component.

## When to extend vs when to reuse

Reuse existing shared/files components when:

- the backend API is different but still returns `TFileDirectory` and `TFile`
- the page wants the same open/edit/save behavior
- the page mainly differs in surrounding metadata or actions

Extend shared/files when:

- the new behavior is generic for any file workspace
- the logic is not tied to skills, projects, or another single feature
- the same rule would be expected by future file-based screens

Do not extend shared/files with:

- skill-specific badges or repository metadata
- feature-only toolbar actions
- feature-only copy that would sound wrong in another file workspace

## Practical rule for future AI work

If you are adding another file-based screen, start by asking:

1. Can this screen supply `TFileDirectory[]` and `TFile`?
2. Can it reuse the existing save/discard/edit rules?
3. Is the difference only API wiring or page-level chrome?

If the answer is yes, reuse `shared/files` first and change loaders or outer layout before considering a new component.
