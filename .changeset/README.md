# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage npm package releases.

Current release automation scope:

- CI only publishes `@metad/ocap-core`
- changeset entries that target other packages are blocked by `pnpm release:verify`

Create a release note with:

```bash
pnpm changeset
```

Use this frontmatter when releasing the current automated npm package:

```md
---
'@metad/ocap-core': patch
---

Describe the user-facing change here.
```

If release automation is expanded to more packages later, update:

- `tools/release/verify-core-only-changeset.mjs`
- `tools/release/publish-npm-packages.mjs`
