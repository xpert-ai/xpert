---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Fix Linux template file initialization by reusing validated directory handles during create-only writes. Preserve existing files, directory containment, and rejection of untrusted symlinks.
