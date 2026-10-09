---
'@xpert-ai/desktop': patch
'@xpert-ai/desktop-protocol': patch
---

Add a generic, user-initiated microphone and system-audio capture capability on macOS 15+. Deliver versioned capture events and WAV chunks to callbacks declared by the requesting plugin View, with encrypted local buffering, resumable delivery, device ownership checks, and shutdown on sleep or account changes. Keep application workflows in plugins and publish the shared command and delivery contracts.
