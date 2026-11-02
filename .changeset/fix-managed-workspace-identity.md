---
'@xpert-ai/nsjail-runner': patch
---

Initialize managed application and upload directories using the configured workspace UID/GID before they become visible. Safely recover the legacy root-owned `.apps` mountpoint without changing saved content, and verify concurrent non-root API access alongside sandbox isolation.
