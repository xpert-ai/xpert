---
"@xpert-ai/xpert-api": patch
---

Allow native Pipeline coordinators to dispatch Project work while retaining reservations for actual Runtime invocations and unacknowledged attempts. Return only the tasks touched by a step update so ordinary task tools do not update unrelated Pipeline execution projections.
