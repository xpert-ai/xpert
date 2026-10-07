---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/plugin-sdk': patch
---

Add explicit, revision-bound Project Task acceptance and rework decisions. Bind decisions to the current implementation, specification, and result or Artifact versions; keep retries idempotent and reject completion through generic task updates. Once independent review is requested, acceptance requires the latest valid passing review for that implementation.

Expose runtime progress, delivery and consumption, review reports, decision history, and authorized human controls in Tasks & Timeline. OS provides the shared review protocol and validation; the current review dispatch gate requires the Computer OpenCode executor supplied by Pro. This batch does not include Computer execution, live conversation streams, or message cards.

Apply `20261006-project-task-decisions.sql` after the task association and reliable reply migrations. Validation covers local tests and isolated PostgreSQL; it does not represent live model or CLI acceptance.
