# Application Docker image releases

`.github/workflows/docker-publish.yml` validates affected images on pull requests
and pushes to `develop` / `main`. Changesets authorize publication, while relevant
source changes trigger validation even without a release note. Arbitrary Git/npm
tags do not run this workflow.

The workflow checks dependencies, builds each selected image once, checks API/Web
startup and health, and saves the verified image. Only an authorized push can load
that artifact and publish it, after every selected build succeeds. API and Web
dependency workflows are reusable prerequisites, rather than parallel independent
image builds. Existing NsJail source/sandbox validation remains separate; its image
is built here without claiming to exercise privileged sandbox execution.

## Select images explicitly

| Changeset package         | Version source                        | Image                 |
| ------------------------- | ------------------------------------- | --------------------- |
| `@xpert-ai/xpert-api`     | `apps/api/package.json`               | `xpert-api`           |
| `@xpert-ai/xpert-ui`      | `apps/cloud/package.json`             | `xpert-webapp`        |
| `@xpert-ai/nsjail-runner` | `packages/nsjail-runner/package.json` | `xpert-nsjail-runner` |

All three packages are private and versioned by Changesets; they are not published
to npm. NsJail's manifest versions the Xpert runner image, independently of the
upstream NsJail binary version pinned in its Dockerfile. Its implementation stays
in `.deploy/nsjail-runner`.

Add a **new** Changeset for the image(s) to publish, for example:

```md
---
'@xpert-ai/xpert-api': patch
---

Fix the API startup configuration.
```

This requests only the API image. A single note can name multiple applications.
Use `patch`, `minor` or `major` as appropriate. Desktop-only changesets, unrelated
npm package notes, unrelated documentation, and edits/renames of existing notes
alone do not request Docker publication.

Once an application has a pending Changeset, a subsequent change to its source,
shared build inputs, Dockerfile or dependency lock requests a new candidate for
the fixing commit. It reuses the pending note and does not require another note
just to retry a failed build. Only affected applications are rebuilt; the highest
pending bump still determines their candidate base version. Source-only changes
without an application note are built and checked, but never published.

## Candidate and stable versions

- A new application note, or a relevant fix with a pending note, on `develop` produces
  `<next-version>-candidate.develop.<sha12>`, `sha-<full-commit>` and
  `develop-candidate`. The highest pending bump determines the next version.
- New notes and pending-note repairs on `main` produce `candidate.main` versions and the
  `main-candidate` alias. They do not change `main` or `latest`.
- Land the notes on `main` first. Then merge the Changesets version PR, or use
  `corepack pnpm changeset:version` on a branch from that `main`. This separate
  commit must consume all pending application notes and increase the manifest
  version by their requested bump. The push to `main` builds the stable version
  and publishes `<version>`, `sha-<full-commit>`, `main` and `latest`.
- A version bump without a previously landed application note does not authorize
  an image release. Wrong version bumps and unconsumed notes fail before building.
  Version commits on `develop` remain candidates. PRs can validate either plan
  but cannot publish images or access registry credentials.

Downstream wrappers may explicitly select `retainedChangesetPolicy: 'candidate'`
when synchronizing upstream releases. The version increase must match the notes
actually consumed. If application notes remain, the next candidate version is
calculated from the new manifest and those remaining notes, including on `main`;
stable aliases stay disabled. A version bump consuming no application note still
fails. The default policy remains `reject`.

An aggregated downstream merge may include an upstream note and its consumption,
so neither endpoint contains that note. With the candidate policy and remaining
application notes, the planner can verify a non-merge source version commit in
the incoming history. If the merge contains multiple upstream releases, the planner
walks backward from the current application version to the baseline through a
continuous chain of ancestor releases. Each source commit must pass the default
strict gate against its own parent, including its exact requested version bump
and shared-package coverage. Missing intermediate declarations and release evidence
from sibling branches cannot fill a gap. This historical evidence only authorizes candidates;
it cannot promote stable aliases or justify an undeclared version increase.

Wrappers may also select `applicationNames` from the service registry. Selection
scopes both version validation and shared-package coverage before constructing the
matrix; unrelated image release failures do not block that wrapper. The default
checks API, Web and NsJail.

Each selected image retains the existing `linux/amd64` platform and publishes to
GHCR, Docker Hub (`metadc`) and Aliyun ACR (`metad`). API/Web use the `candidate` or
`production` Docker stage; NsJail uses its default final stage. The registry names,
credentials and runtime image behavior are unchanged.

## Failure recovery and image identity

Dependency, build or health-check failures prevent all publication jobs. Fix the
source and push the repair; pending application notes authorize the next candidate
with the repair's SHA. Re-running an old GitHub Actions run still builds the old
commit and cannot pick up a newer repair.

Registry-only failures can retry the publication job using its saved image, without
rebuilding. The publisher verifies the artifact's image ID, source revision and
version labels before writing any tags. Existing version and SHA tags must resolve
to that same image; a different image is rejected. Matching tags are skipped during
partial retries. Channel aliases move only after immutable tags succeed on every
mirror. The production environment approval remains on the publication job.

Verified image artifacts are retained for seven days. After artifact expiry a full
run is required; immutable-tag checks still reject a different rebuilt image for an
already published version. Formal release versioning and note consumption are
unchanged; publication retries do not create or consume Changesets.

## Shared package coverage

Application source imports are not fully represented by package dependencies.
The release check therefore uses the shared workspace packages in the API/Web
Docker dependency profiles, plus the browser-safe plugin-sdk sources copied by
Web. When adding a Changeset for one of these packages, also add a **new** Changeset
for every consuming application, either in the same file or another new file.

- `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk`: declare API and Web.
- `@xpert-ai/server-ai`: declare API.
- UI/Formly packages in the Web dependency profile: declare Web.
- Packages unrelated to those profiles: no application declaration is required.

When consuming shared package notes with a version increase, consume and version
the corresponding application notes in the same release. Merely adding an
application candidate note at this stage is insufficient. Errors list the exact
missing applications. Existing pending shared notes on an unrelated push are
ignored, so a Desktop update does not request application images or fail coverage.

Dockerfile, dependency-lock and configuration changes need an application note when
they should ship. An existing pending application note is sufficient for a relevant
repair; path changes without one trigger validation only.

## Local verification

The planner installs only five small release-tool packages, without application
dependencies or native server modules:

```bash
npm ci --prefix .deploy/application-images/release-tools --ignore-scripts --no-audit --no-fund
node --test .deploy/application-images/*.test.mjs
```

To inspect a committed push without publishing anything:

```bash
IMAGE_RELEASE_BEFORE="$(git rev-parse HEAD^)" \
IMAGE_RELEASE_AFTER="$(git rev-parse HEAD)" \
IMAGE_RELEASE_EVENT=push \
IMAGE_RELEASE_REF=refs/heads/develop \
node .deploy/application-images/release-plan.mjs
```

The planner reads exact Git revisions, including deleted Changesets, and prints
the selected images, versions and tags. Unit tests use temporary Git histories to
exercise candidates, repair commits, stable releases, unrelated commits, coverage
failures, workflow ordering, artifact identity and partial publication retries.
