# Bosi Desktop releases

`.github/workflows/desktop-release.yml` builds Bosi in `xpert-ai/xpert` only.
Changesets versions the private `@xpert-ai/desktop` app; it is never published to npm.

## Targets and downloads

| Platform | Architecture          | GitHub runner      | Installers       |
| -------- | --------------------- | ------------------ | ---------------- |
| macOS    | Apple Silicon / arm64 | `macos-15`         | DMG, ZIP         |
| macOS    | Intel / x64           | `macos-15-intel`   | DMG, ZIP         |
| Windows  | x64                   | `windows-2025`     | NSIS EXE, ZIP    |
| Windows  | arm64                 | `windows-11-arm`   | NSIS EXE, ZIP    |
| Linux    | x64                   | `ubuntu-24.04`     | AppImage, tar.gz |
| Linux    | arm64                 | `ubuntu-24.04-arm` | AppImage, tar.gz |

Each target runs on its native architecture. Labels follow the
[GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
The filenames include the version, OS and architecture, so assets cannot collide.
All successful builds upload installers and checksums to Actions Artifacts for 30 days.

## Request a build with a Changeset

Add a **new** file such as `.changeset/bosi-my-feature.md`:

```md
---
'@xpert-ai/desktop': patch
---

Describe the Desktop change.
```

Use `patch`, `minor`, or `major` as appropriate. `corepack pnpm changeset` can also
create the note. Source-only edits, existing/renamed notes, other package changesets,
Git tags and dependency-only Desktop version bumps do not request an installer build.
Shared UI, contracts or protocol changes intended for a Bosi release must include a
Desktop changeset too.

- PRs with a new Desktop note build candidate artifacts with no signing secrets
  and no release-writing permission. Subsequent PR commits verify the complete diff
  from the merge base, so source updates still rerun those candidate builds.
- New Desktop notes pushed to `develop` or `main` build candidate artifacts such as
  `0.1.1-candidate.develop.<commit>`; they do not create GitHub Releases.
- First merge the pending note into `main`, then merge the Changesets version PR
  (or run `corepack pnpm changeset:version` on a branch from that `main`). The matching
  version increase and consumed note authorize the stable build. Keep these as separate
  pushes so the previous revision contains the pending release evidence.
- After **all six** stable jobs pass, the production job creates a GitHub Release
  **draft** named `Bosi <version>` with tag `desktop-v<version>` pinned to the source
  commit. It attaches all twelve installers, `SHA256SUMS.txt` and `release-manifest.json`.
  Review and publish the draft manually. This does not configure an app auto-updater.

There is no manual-dispatch bypass. A partial draft upload can be rerun: existing
assets must have the same source commit and SHA-256 digests. Published releases,
conflicting tags or assets are never overwritten.

## Dependency isolation and checks

`dependencies.cjs prepare <directory>` copies only Desktop, contracts,
desktop-protocol and shadcn-ui source into a separate workspace, using this profile's
committed pnpm lock. The root API, Angular application and server-native modules
are not installed. Electron's download script is run explicitly after an
`--ignore-scripts` install; repository preparation hooks are not run in CI.

The build checks and compiles contracts from source, runs Desktop/protocol tests,
typechecks and bundles the renderer, packages with electron-builder, then runs the
packaged Electron in Node mode to verify its version, host modules and renderer
assets. The Bash process suite runs on macOS/Linux; Windows runs every portable
suite. This is a packaging check, not a replacement for native GUI/manual acceptance.

```bash
node .deploy/desktop/dependencies.cjs update
node .deploy/desktop/dependencies.cjs check
npm ci --prefix .deploy/desktop/release-tools --ignore-scripts --no-audit --no-fund
node --test .deploy/desktop/*.test.*
```

Root `lockfile:update` / `lockfile:check` also maintain this profile, including after
Changesets versioning. CI does not rely on developer-built `dist` directories.

## Connection defaults

Official builds use `https://api.xpertai.cn/api/`, `https://app.xpertai.cn/` and
`https://app.xpertai.cn/chatkit`. Vite embeds the resolved defaults in
`dist/connection-defaults.json`; the packaged runtime check also verifies this
snapshot. Existing user-saved connections are retained.

For manual customer builds, set `XPERT_DESKTOP_API_URL`, `XPERT_DESKTOP_WEB_URL`
and `XPERT_DESKTOP_CHATKIT_URL`, or set `XPERT_DESKTOP_CONNECTION_FILE` to an
absolute JSON file path. See [customer build commands](../../apps/desktop/README.md#customer-builds).
Pass these when running the build step, before packaging. Changing variables only
at packaging time does not alter the already built defaults.

## Optional signing and notarization

Configure the following **repository secrets** for branch builds (not PR builds):

| Platform                                   | Secrets                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| macOS Developer ID signing                 | `DESKTOP_MAC_CSC_LINK`, `DESKTOP_MAC_CSC_KEY_PASSWORD`                             |
| macOS notarization, in addition to signing | `DESKTOP_APPLE_ID`, `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`, `DESKTOP_APPLE_TEAM_ID` |
| Windows certificate signing                | `DESKTOP_WIN_CSC_LINK`, `DESKTOP_WIN_CSC_KEY_PASSWORD`                             |

`CSC_LINK` values use electron-builder's supported certificate URL/base64 format.
When certificates are configured, signing failures fail the job. Partial Apple
notarization credentials also fail instead of silently producing a different build.
Without credentials macOS builds use ad-hoc signing and Windows builds are unsigned;
the release manifest and draft explicitly identify these as test downloads requiring
OS security confirmation. Configure Developer ID + notarization / Windows signing
before distributing trusted installers to end users. No certificates are embedded
in artifacts. The draft job uses the production environment and `GITHUB_TOKEN` with
`contents: write`; it never publishes automatically.

Signing options target the installed electron-builder 26.x API; see the
[versioned signing documentation](https://www.electron.build/v26/docs/features/code-signing/).
