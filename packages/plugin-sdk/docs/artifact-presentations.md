---
title: Authenticated Artifact presentations
description: Plugin renderers for immutable shared Artifact versions
---

Artifact presentations separate authenticated display from owner-only management. The platform owns link policy, version resolution, plugin registration, request context and the isolated browser host. Providers own content schemas and rendering. No new Artifact kind or share table is needed.

## Provider contract

Register a Nest provider with `@ArtifactPresentationProvider({pluginName, resourceType})`, implement `IArtifactPresentationProvider`, and include it in the plugin module. Registry discovery uses the explicit source pair and plugin provenance in the authorized organization.

- `getEntry()` returns `{html}` with its packaged frontend assets.
- `read(context)` returns the provider's initial JSON data.
- `operations` declares the read-only operation names available to the page.
- `query(context, request)` validates application input and executes those operations as `context.actor`.

The context contains the current viewer, authorized Artifact metadata, the exact formal version and its bytes. It does not grant access to the creator's Workspace or other sources. Never replace the viewer with the Artifact owner. Validate the application's content package, identity, limits and integrity before use. Keep draft, save and publish operations out of this interface.

## Platform transport

`ArtifactLinkRecord.presentationUrl` points to `/artifacts/view/:slug`. It is derived by the platform from its configured public URL. Use it directly rather than constructing plugin-specific URLs. The page requires normal authenticated login and preserves the return URL.

`GET /api/artifacts/shared-links/:slug/presentation` returns schema version 1, `target: {artifactId, versionId}`, published title/version number, `readOnly: true`, entry HTML, data and allowed operations. `POST` to the same path plus `/query` takes `{target, operation, input}`. These are authenticated management-session APIs, not ChatKit client-secret endpoints or anonymous content URLs.

Every read/query resolves current link status, membership and its formal target. Queries reject target changes before dispatch. Access and target are rechecked before returning results, so in-flight revocation or publication cannot release stale results. Follow-latest links require reopening after publication; fixed links remain on their selected formal version. Source authorization remains the provider's existing governed capability boundary.

To open `presentationUrl` from an authoring Workbench iframe, declare the `artifact.presentation.open` client command in its View manifest and invoke it with `{url: presentationUrl}` (`ArtifactPresentationOpenRequest`). The platform opens a separate window with no opener, accepts only its own `/artifacts/view/:slug` URL, and reports blocked popups as a failed result. The new page performs normal authentication and authorization. A raw `target="_blank"` link inherits the remote iframe's sandbox and can prevent the login application from starting. Keep the iframe sandbox unchanged. The standalone read-only presentation does not expose this command. Browser bundles can use a type-only contracts import and the command string to avoid pulling server-oriented runtime exports into their CSP-restricted entry.

The Cloud application opts in through `provideArtifactPresentationCommands()` in its root providers. Registration and cleanup belong to the Artifact feature; `ViewClientCommandRegistry` only stores and dispatches commands and has no dependency on Artifact presentation code.

## Browser protocol

The generic component hosts the entry in an opaque `sandbox="allow-scripts"` iframe with no-network CSP. It accepts remote-component protocol v1 `ready`, `requestData` and `executeAction` messages only. The host validates the exact source window and instance ID, and relays only declared read operations with the server-resolved target. It exposes no file, navigation, client-command or authoring channels and never sends credentials to the iframe. Theme and locale changes resend `init` for the same instance; providers must handle it without resetting the selected resource or reloading unchanged data. Changing the share route cancels in-flight requests and creates a new instance.

Bundle assets into the entry or immutable application package. External scripts, network fetches, forms, frames to network URLs and direct parent access are unavailable. Reuse Artifact document dependency snapshots for version-pinned HTML libraries.

The Live Dashboard plugin is a reference implementation: it reuses one React bundle in authoring/read-only modes, routes only `query` / `query-binding`, and resolves each Binding from the authorized immutable package. Its source capability still receives the current viewer.

## Source collaboration restrictions

`AnalyticsProviderDescriptor.sharing` optionally declares `viewer_permissions` or `owner_only`, with a stable diagnostic `reasonCode`. This is a compatibility restriction, never an authorization grant. Omission retains ordinary per-viewer source checks. Providers with private transitive dependencies should declare `owner_only` until those dependencies support explicit collaborative authorization.

No database migration is needed. Deploy platform contracts, SDK, backend and Cloud support together before loading plugins using this registry. Older hosts cannot provide the standalone page merely by upgrading the plugin.
