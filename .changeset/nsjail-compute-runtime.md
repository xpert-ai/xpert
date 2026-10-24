---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/nsjail-runner': minor
---

Add a built-in NsJail Compute Runtime Provider so open-source deployments can run Python and JavaScript Workspace Script Actions without a Pro Runtime Provider. The Runner includes the pinned Compute rootfs and a separate authenticated, offline Jobs protocol with read-only inputs, bounded scratch storage, cgroup v2 resource limits, streamed host invocations and deterministic cleanup. Update both API and Runner together; Compute remains unavailable on older Runners or without cgroup v2 isolation.
