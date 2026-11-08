---
'@xpert-ai/xpert-api': patch
---

Declare the Plugin SDK in local and Docker API build roots so relocated compiled libraries can resolve exported subpaths such as analytics. Preserve the SDK's package exports and the existing production dependency layout.
