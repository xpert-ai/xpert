---
'@xpert-ai/desktop': patch
---

Fix Bosi installer builds on all platforms by resolving the signing verification hook from the Desktop app directory. Preserve microphone entitlements in ad-hoc macOS builds so audio capture passes the same signing checks as certificate-signed builds.
