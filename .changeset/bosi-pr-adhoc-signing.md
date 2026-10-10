---
'@xpert-ai/desktop': patch
---

Allow certificate-free ad-hoc macOS signing in pull-request builds so the packaged app, Electron helpers and native recorder pass the audio entitlement checks. Keep certificate secrets restricted to branch builds.
