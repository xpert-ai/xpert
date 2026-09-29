# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage npm package releases.

The private `@xpert-ai/desktop` app also uses Changesets for cross-platform Bosi
installer builds. See [Desktop release instructions](../.deploy/desktop/README.md).

The private `@xpert-ai/xpert-api`, `@xpert-ai/xpert-ui` and
`@xpert-ai/nsjail-runner` packages also gate their respective Docker image releases.
Shared package releases must include their consuming API/Web applications.
See [Application image release instructions](../.deploy/application-images/README.md).

Peer dependency releases only promote a dependent to major when the new version
falls outside its declared compatibility range. Internal plugin peers use
`workspace:^` for compatible SDK and contract releases. Formly explicitly supports
Headless UI `^0.0.2 || ^0.1.0`; later pre-1.0 minor versions still require a
compatibility review and range update. `workspace:*` pins the exact current version
when published, so it is unsuitable for peers that should accept minor upgrades.

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
