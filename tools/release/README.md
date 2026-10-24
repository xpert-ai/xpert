# Dependency refreshes

## ChatKit patch updates

```sh
corepack pnpm run deps:update:chatkit
```

The five ChatKit catalog entries in `pnpm-workspace.yaml` use patch ranges.
This command selects published stable patches within each range; it does not cross
the configured minor line or select prereleases. To adopt another minor line, update the catalog
ranges deliberately and run the same command.

The updater resolves versions once, checks declared dependencies and peers between
the selected ChatKit packages, and generates all five lockfiles in temporary
manifest-only workspaces: root, API build, API production, Web and Desktop. Each
profile uses the same resolved versions and must pass a frozen offline lock check.
Source catalog ranges are retained. Failed resolution or concurrent source edits
leave the source locks untouched. The command does not install into the checkout's
`node_modules`, run package lifecycle scripts, build images or publish packages.

Temporary resolution overrides also align transitive-only consumers such as
Desktop's `chatkit-web-shared`; the original override policy is restored before
each frozen check and is not changed in the source workspace or generated locks.

Review and commit the lock changes with an application Changeset before building
images. Declared dependency compatibility is checked here; UI/API behavior still
needs the normal application acceptance. Docker continues to install the committed
locks with `--frozen-lockfile`, so publishing a package alone does not alter builds.

`corepack pnpm run lockfile:update` keeps its existing manifest/lock synchronization
behavior. Commit hooks do not invoke the ChatKit registry updater. To add another
ChatKit package to the coordinated update, extend the explicit package list in
`chatkit-locks.mjs` and its catalog entry.
