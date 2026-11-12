---
'@xpert-ai/desktop': patch
---

Build and ship the Windows Shell supervisor ahead of execution instead of compiling it for every command. Require an explicit launch handshake so cancellation or worker loss during startup cannot run the command, while retaining Job Object completion checks.
