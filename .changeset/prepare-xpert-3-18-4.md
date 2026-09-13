---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-ui': patch
---

Prepare the Xpert 3.18.4 patch release.

The target platform version is 3.18.4. Before publishing, align contracts,
plugin-sdk, and xpert-ui to this version in the release version PR, including
their internal dependency references, changelogs, and lockfile entries. Their
current versions differ, so patch bumps alone do not align the three anchors.
