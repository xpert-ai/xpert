# First-send Project bootstrap

An Assistant may opt into Project creation at the Agent Protocol run entry:

```yaml
team:
  options:
    workspaceScope:
      mode: project-required
      onMissing: create
```

Opening a blank chat does not create a Project. On `send`, when neither the
conversation nor the request specifies a Project, `RunCreateStreamHandler`
calls `ConversationProjectService` before applying the Assistant principal.
Existing Projects and explicit selections use the existing access checks.
Retry, resume and follow-up actions never create a new Project.

The Assistant entry opens a blank conversation; it never resumes the most recent
conversation or selects a Project from history. Project-local new conversations
keep their current Project and their button explicitly says so.

ChatKit sends an explicit `projectSelection` on `send`:

- `auto-new`: create on the first send, ignoring stale host Project context.
  Opening the composer or selecting this option does not create anything.
- `none`: stay outside Projects. The server saves this intent in conversation
  options so defaults after a reload cannot implicitly create or bind a Project.
- `existing`: use the explicitly selected `projectId` after checking access.

For `project-required` Assistants, the selector hides `none`; the API still
rejects it, without silently creating a Project. Assistants opting into automatic
creation default to `auto-new` and show "Create on send". Switching selection
clears the old business view selection and request context. Existing saved
conversations retain their Project; subsequent sends and retries reuse it.
Clients omitting `projectSelection` retain the legacy request/context fallback.

The service checks conversation access, the human caller's creation permission,
feature availability, the published Assistant and the configured Project type.
Direct Project types support this path. Entity-bound application types retain
their governed business creation entry and cannot fall back to a generic type.

A transaction locks the conversation row, rereads its Project, then creates the
Project, connects the canonical Assistant family and binds the conversation.
The shared empty-bootstrap predicate rejects personal conversations with saved
messages, goals, file links, attachments or executions. A failed bind rolls back
creation. Concurrent requests reuse the winner's persisted binding. Workspace
initialization after commit is idempotent; a storage failure cannot cause a
second Project on retry.

The personal (`none`) choice uses an atomic conditional update on the same
conversation row: it cannot overwrite a bound Project and merges only the
selection into the current options. Project binding rejects a saved `none`
selection, and automatic creation rechecks it after acquiring the row lock.
If different choices race, the loser fails before starting a model run; the
conversation cannot retain both a Project id and a personal selection.

First-send attachments retain their uploaded FileAsset handles. Existing chat
normalization and attachment authorization link and project them into the saved
Project scope. Cross-Project file reuse remains rejected; this feature does not
reassign another Project's assets. Uploads in an active thread resolve that
thread's persisted Project even if its initial ChatKit mount had no Project.

The workbench reads the saved conversation at conversation start, response end
and thread load. It replaces the URL with the Project route.
During adoption of the same thread it retains the initial ChatKit
mount identity, so the stream and composer are not recreated. Navigating to a
different thread or Project restores normal scope isolation. The server's saved
conversation remains authoritative for subsequent runs and uploads.

`chatkitMountProjectId` is only the initial hosted session binding. ChatKit
separately resolves the saved conversation's Project on conversation start,
response completion and history reload. Its file selectors and other Project
controls use that runtime scope without changing the stream mount key. Ship
the corresponding ChatKit UI update with this host change; preserving only the
mount binding leaves those controls pointed at the Assistant workspace.
Once a conversation starts, ChatKit keeps the bound Project name visible as a
fixed scope instead of hiding the Project rail. It resolves the name through
the SDK without loading Project choices. A personal conversation with no Project
keeps the rail hidden. Updating the displayed scope does not remount the chat.

`settings.conversationBootstrap` records the server-owned provisional name.
Business provisioning may replace it once. Explicit user renaming marks it as
resolved, and later provisioning preserves it. Name updates do not move volumes.

Bid Studio's source template 107 enables the policy only for the coordinator.
Role Assistants remain `project-required` without automatic creation. The Prompt
workflow uses the inherited Project for `bid_prepare_bid_project`, delegation
and outline acceptance. It does not ask users for platform IDs or manual setup.

## Verification and rollout

Targeted tests cover the first-send gate, attachment handle preservation,
authorization ordering, persisted-scope reuse, transaction lock usage, failure
paths, cross-Project attachment rejection, name reconciliation, route adoption
and stale UI responses. Service tests simulate the database winner; the opt-in
PostgreSQL binding integration suite also uses two connections to verify both
orders of the personal-selection versus Project-binding race. Run it with
`CHAT_CONVERSATION_BIND_PROJECT_PG_E2E=1` and test database connection variables;
it creates and removes an isolated schema.

This change is source-only: no service restart, plugin reload, installed draft
update or publication was performed. Activate the host code and template 107,
preserving instance-owned models and bindings, before the live acceptance run.
Use a fresh chat, one tender attachment and one sentence requesting an outline
only. Verify a single Project, shared expert file access, an unchanged first
message and composer, accepted outline outputs and no body-writing tasks.

Legacy internal `XpertChatCommand` callers still require an explicit Project;
automatic user-owned creation is intentionally confined to the authenticated
Agent Protocol first-send boundary.
