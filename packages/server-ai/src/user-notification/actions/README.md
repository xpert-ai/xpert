# Human action notifications

`action.required` is an in-app notification projection, not an approval record. The source domain owns the attention lifecycle, recipient policy, evidence, authorization and decision concurrency. Read state never settles an action.

- `ActionNotificationSources` resolves the current presentation and recipient access on list and click. Stored source IDs are references, not grants. A missing provider is unavailable.
- Presentation failures are isolated per notification on list, snapshot, pending count and click, with a payload-free diagnostic. They never mark a source handled or closed. Domain reconcilers and action commands retain their own strict failure semantics; unavailable recovery adapters can become visible again after reloading.
- `PublishActionNotificationCommand` projects one exact source version to current recipients. Its transaction persists the notification and existing notification outbox together. Replays do not create duplicates or reset `readAt`; terminal sources do not create notices for newly assigned users.
- `PendingActionNotificationsQuery` gives domain reconcilers bounded references without exposing notification persistence to those domains.
- The pipeline adapter recovers from durable human attention rows, including pre-upgrade open gates. Its bounded sweeps repair interrupted delivery, membership changes, closed rounds and deleted sources. No approval command is replayed.
- Pipeline policy adapters may declare `decisionRecipientRoles`. The host resolves active human project members and organization membership. No declaration means no implicit audience. This declaration does not authorize approval or downstream installation. Coding declares its existing owner/manager audience; plugin installation retains its separate host permission check.
- Web and Desktop negotiate the v2 notification profile, retain the older agent-output profile on older hosts, and use the existing `project.pipelines` navigation with exact node/round/instance focus. Clicking first revalidates the notification, then uses the native pipeline decision UI.
- Pending notifications survive retention. Terminal notifications expire 90 days after resolution. The badge includes all currently visible pending actions, independently of read state and pagination.

Event Inbox, Agent event bindings, middleware context and the native decision protocol are unchanged. External IM delivery is outside this in-app implementation; no synthetic Assistant binding is created.

## Deployment and checks

Before switching API replicas, run the new image's normal `node main.js --command schema-sync`, then `--command schema-sync --action verify`, with the same database and installed plugin configuration. API readiness alone does not apply migrations. Deploy the source policy declaration as well as the host; a descriptor alone does not prove a plugin is running.

Regression coverage lives in `notification.integration.spec.ts`, `pipeline-notification.postgres.spec.ts`, the existing agent-output integration suite, and Web/Desktop notification/navigation tests. It includes concurrent projection and native decisions, interrupted outbox writes, revocation, cross-account denial, old pending retention, cancellation, new rounds, deleted projects and protocol compatibility.
