---
'@xpert-ai/desktop': patch
---

Improve macOS recording reliability with a private, hardware-clocked Core Audio tap that starts during system silence and follows the negotiated sample rate. Preserve audio buffer ownership, bound queued input, and separate device startup from first-frame timeouts. Handle cancellation and blocked device shutdown, preserve actionable permission errors, and finish saving stopped captures before removing delivered audio from the cache. Keep synthetic test modes out of the shipped recorder and document packaged app launch requirements for correct macOS permission attribution.
