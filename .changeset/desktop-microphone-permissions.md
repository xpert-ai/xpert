---
'@xpert-ai/desktop': patch
---

Include microphone entitlements in macOS app and helper signatures and verify packaged audio executables after signing. Share native microphone permission checks between realtime voice and plugin audio capture, report signing and consent failures before opening a voice session, and detect missing input or sustained digital silence during calls without treating intentional mute as a fault. Distinguish system-audio permission failures from microphone failures.
