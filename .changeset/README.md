# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage npm package releases.

Create a release note with:

```bash
pnpm changeset
```

Use standard Changesets frontmatter for any publishable workspace library, for example:

```md
---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/contracts': patch
---

Describe the user-facing change here.
```
