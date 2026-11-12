---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Keep a delegated group request open until the calling Assistant has consumed the member replies. Distinguish queued replies and pending steer inputs from consumed replies so an early continuation does not complete the parent request or suppress the eventual final answer.
