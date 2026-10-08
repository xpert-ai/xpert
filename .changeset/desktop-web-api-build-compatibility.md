---
'@xpert-ai/desktop': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Declare jsdom as a direct Desktop development dependency so isolated installer builds can run the renderer tests without relying on transitive server dependencies. Regenerate the Desktop dependency lock for reproducible CI installs.

Use ES2020-compatible quote escaping for execution usage CSV exports so the Web production build succeeds without raising its browser library target.

Exclude test-support directories from the server-ai production compilation so Jest mocks remain available to tests without entering API build output.
