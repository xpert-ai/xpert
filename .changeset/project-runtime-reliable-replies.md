---
'@xpert-ai/server-ai': minor
---

Commit Runtime result references and outbox intents atomically, deliver them through Handoff with durable inbox acknowledgements, and arbitrate bounded waits against stable follow-up executions. Enforce thread writer admission, approval/user-stop barriers, current authorization, and recovery without replaying ambiguous CLI or model runs.

Recover pending Project dispatch intents and observe running invocations independently of their parent. Project only the current unchanged attempt into in-progress, review or blocked; keep final business acceptance separate. Add owner-scoped delivery inspection and explicit redrive endpoints, and preserve review in simple-project task editing.

Apply `20261006-runtime-reliable-replies.sql` after `20261006-project-task-runtime.sql` before deploying. These changes have local unit and isolated PostgreSQL coverage; live Computer/CLI acceptance remains a separate step.
