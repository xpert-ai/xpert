# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage npm package releases.

The private `@xpert-ai/desktop` app also uses Changesets for cross-platform Bosi
installer builds. See [Desktop release instructions](../.deploy/desktop/README.md).

The private `@xpert-ai/xpert-api`, `@xpert-ai/xpert-ui` and
`@xpert-ai/nsjail-runner` packages also gate their respective Docker image releases.
Shared package releases must include their consuming API/Web applications.
See [Application image release instructions](../.deploy/application-images/README.md).

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

When a package is published from build output rather than its source folder, define
`publishConfig.directory` in that package's `package.json`.
