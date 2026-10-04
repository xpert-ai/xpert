# Assistant View Context Switching

For the same authenticated identity, organization, and Assistant, an open View iframe is not recreated when `conversationId` or `projectId` changes. The host revalidates View visibility and access to its entry document in the target context, then sends a common event to all mounted Views, including hidden tabs. Each View decides whether to refresh its data, clear selections, or rebind connections.

No new manifest lifecycle declarations or acknowledgment handshake are introduced. Closing a View, explicitly reloading it, switching identity, organization, or Assistant, or changing the entry document still disposes of the original iframe. If access is denied, the previous document must no longer be used. Preserving an iframe does not permit reusing authorization across contexts.

## Deployment Dependencies

The workspace catalog pins all ChatKit packages (Angular, Types, UI, Web Component, and Web Shared) to 0.10.0. The UI uses Xpert SDK 0.6.0. The workspace lockfile and the API, Web, and Desktop deployment lockfiles keep these versions aligned.

Deploy the shared protocol, Angular View host, and built-in View consumers first, followed by the ChatKit 0.10.0 frame and Cloud host. Cloud changes that reuse ChatKit instances across projects or conversations must ship with the matching frame; they must not be enabled with an older frame that does not support context updates. When using a custom `CHATKIT_FRAME_URL`, update the frame served at that address as well. The default deployment copies the frame directly from the pinned ChatKit UI package. The Computer consumer ships separately in the Pro edition.

## Protocol

The initial `init` message includes `runtimeScope` and `scopeRevision`, with unbound scope fields set to `null`. Until the host finishes resolving the target context, it withholds the new context and suspends operations initiated by the View.

Subsequent updates use the existing `hostEvent` message:

```json
{
  "channel": "xpertai.remote_component",
  "protocolVersion": 1,
  "instanceId": "view-instance",
  "type": "hostEvent",
  "event": {
    "id": "unique-event-id",
    "type": "view.context.changed",
    "source": "chatkit",
    "receivedAt": "2026-10-03T00:00:00.000Z",
    "data": {
      "revision": 2,
      "runtimeScope": {
        "projectId": null,
        "conversationId": "target-conversation"
      }
    }
  }
}
```

`runtimeScope` is a complete snapshot of the target scope. `revision` increases monotonically within the same iframe instance, but values are not guaranteed to be consecutive. This event does not require a manifest subscription. The Angular host sets `source` to `xpert`.

Views accept messages only from the host window with a matching `instanceId` and ignore stale revisions. Subsequent requests include the latest `scopeRevision`. The host determines the request scope from its own authorized context and does not allow Views to override it. Requests from the previous context are canceled or their responses discarded, and file access sessions rotate with the context. Canceling a request does not undo server operations that have already completed.

## Built-in Views

- Computer preserves the noVNC connection and desktop display, rebinding the conversation through `bind_conversation`. Input is temporarily disabled during rebinding and restored afterward. After verifying that the user, tenant, organization, and computer remain the same, the server returns the actual previous binding. The client checks this binding and retries up to three times to handle races where an earlier request completed but its response was canceled. Binding across environments or to closed connections is still rejected.
- Project Tasks, Scheduled Task Details, and Knowledge Workbench rebuild their page state and reload data within the View. The iframe remains unchanged, and previous selections and pending requests do not carry over to the new context.
- Task Results clears previous resource selections, then waits for resource cards from the current conversation or loads new results.
- ChatKit resets chat execution state and project-scoped editor state while preserving the Assistant's View tabs and iframes. The host replaces the ChatKit instance when the account or organization changes.

Third-party Views must also handle this event: update their local state with the revision and complete scope, then decide which resources to clear or load. Legacy Views can continue using the existing request protocol, but ignoring this event prevents them from correctly refreshing their context data.

## Manual Verification

1. Open an Assistant's new conversation page, open Computer and connect in viewing mode, then send a message to create the conversation. The desktop display should remain visible, and "Start Control" should become available once binding completes.
2. After taking control, switch between two conversations under the same Assistant, then quickly switch back. Input should be briefly disabled during rebinding, with keyboard and mouse control restored afterward. The VNC connection should not be reestablished.
3. Open two Views, switch projects, then return to the hidden tab. The iframe should not be recreated. Its content should belong to the target project, without selections or results from the previous project.
4. Switch to a context where access to the View is denied. The previous document should be removed or an access error displayed. Switching Assistant, account, or organization, or explicitly reloading the View, should create a new instance.
5. Keep a slow request pending before switching context, then let it finish afterward. Its stale result must not overwrite the current page or trigger navigation to the previous conversation.
