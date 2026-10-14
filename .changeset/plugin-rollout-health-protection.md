---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/contracts': patch
---

Exclude expired and unready replica registrations from plugin rollouts, validate returning replicas before admitting traffic, and restart one candidate at a time. Preserve healthy peers on failure, add bounded plugin startup diagnostics and an event-loop-independent watchdog, and restore verified last-known-good plugin configurations without retrying failed recovery indefinitely.

Protect the last healthy replica unless an authorized operator explicitly permits downtime. Pin replacement admission to the active generation's cumulative plugin manifest so queued updates cannot block the current rollout or inherit outage consent.
