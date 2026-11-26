# Host installation authorization

Project approval accepts the release candidate. It does not grant plugin management rights.
The host installation operation separately requires a human who currently manages the Project
and passes the plugin domain's publisher and manifest-derived installation-scope checks.

The installation node presents the exact package, version, SHA-256, current-instance target,
replacement permission and restart permission. Confirmation writes an immutable authorization
bound to the complete persisted operation context, including the approved request, round,
generation and input digest. It never changes the original approval or grants account permissions.

## Boundaries

- The host-internal operation action dispatcher only routes registered operation owners. It is
  not a plugin SDK capability, Coding policy or generic middleware hook.
- The installation service performs business validation and uses `DeployPluginArchiveCommand`
  in inspection mode for permission and scope preflight. Preflight never loads plugin code.
  The original business approver delegates use of the exact approved archive: the host restores
  that identity and rechecks both Project management and artifact ACL when reading its bytes.
  Installation then runs as the separate installer. Project managers gain no general access to
  personally owned artifacts, and no artifact ownership or ACL is changed.
- Notifications project durable operation/authorization state into `action.required`. Only
  current Project owners/managers who also pass current plugin installation policy receive it.
  Reading a notification does not authorize installation. The target remains the exact Project
  pipeline node, including in Bosi. Event Inbox is unchanged.
- Installation authorizations and dispatch markers are host event records. The public
  `platform.plugin-deployment-receipt@1` shape remains unchanged. New host receipts privately
  bind their installation authorizer; bounded independent-test credentials use that identity.
  Successful historical receipts preserve their original approver semantics and are not reopened.

## Recovery and uncertainty

Missing installation authorization produces a pending receipt with
`PLUGIN_INSTALL_AUTHORIZATION_REQUIRED`; the node displays a blocked/waiting state.
The background worker restores and rechecks the installation authorizer on every observation.
Loss of authority before any installation dispatch produces confirmed failure
`PLUGIN_INSTALL_AUTHORIZATION_DENIED`, allowing the pipeline's normal retry policy to create
a new attempt and authorization. After dispatch, loss of authority remains an explicit pending
inspection condition; it must not be mistaken for proof that installation failed.

An authorized worker first inspects the exact archive's installed and loaded provenance. If it
is absent, a transaction checks the current Project/round and live lease fence, then reserves one
installation dispatch. Concurrent confirmations preserve the first authorizer; concurrent workers
cannot reserve a second dispatch. Restarting a worker after a lost response only inspects.
If a worker dies between reserving dispatch and making the external call, the result remains
uncertain and requires investigation; automatic replay is intentionally prohibited.

Pre-upgrade permission-blocked operations can receive the new authorization without resetting
the operation or replacing their business approval. The first authorized observation inspects
before reserving a dispatch. Installation success requires both exact archive provenance and
actual runtime loading. Registration alone does not advance independent acceptance.
The archive inspector verifies the immutable runtime marker and reads the plugin manifest
inside the runtime workspace’s `node_modules`, rather than the workspace manifest itself.
This lets reconciliation recognize an already installed archive without dispatching again.

## Verification

Regression coverage includes denied and stale confirmations, separate approval/installer actors,
archive identity, immutable receipt binding, bounded test access, notification recipients and
handled state, and UI confirmation. PostgreSQL tests exercise concurrent authorizations,
single dispatch reservation, stale generations and lease fences. Existing pipeline operation,
notification and View tests protect generic behavior.
