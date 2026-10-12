---
'@xpert-ai/server-ai': patch
---

Fix group Composer resource browsing, selection validation, and connector authorization for conversation-scoped ChatKit sessions. Recheck the live group membership and selected published Assistant before invoking resource services as the authenticated human, preserve Project and resource access checks, and restore the original request context after each operation.
