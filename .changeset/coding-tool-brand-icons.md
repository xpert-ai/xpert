---
'@xpert-ai/shadcn-ui': patch
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
---

Show bundled Coding CLI brand logos in execution headers, project task/attempt views and resource cards. Prefer published color variants, retaining monochrome when unavailable. Project graphs expose authorized executor identity, keeping the latest implementation separate from review attempts and preserving registered business icons. Unknown tools retain generic icons; status, execution and collection mechanisms remain unchanged.

Keep brand assets, licenses and the React component together in shadcn-ui/brand-icons. Provide a React-free data entry for server resource cards; Coding runtime identity mapping stays in its domain adapter.
