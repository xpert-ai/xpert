# Assistant suite releases

`assistant:suite:init` creates or updates every role listed in a portable `xpert-assistant-suite@1` profile, including specialists not directly connected to the orchestrator. It uses the existing platform authentication and organization-scoped authoring APIs.

## Update an installed suite

Keep credentials in the configured environment or Keychain. Keep installation/release receipts outside the repository: they contain deployment-specific resource IDs, but no tokens, credentials or draft content.

```sh
corepack pnpm assistant:suite:init \
  --profile "$SUITE_PROFILE" \
  --api-url "$XPERT_API_URL" \
  --org-id "$XPERT_ORG_ID" \
  --workspace-id "$XPERT_WORKSPACE_ID" \
  --refresh \
  --installation-file "$PREVIOUS_INSTALLATION_RECEIPT" \
  --manifest-file "$NEW_RELEASE_RECEIPT"
```

The installation receipt selects exact Assistant IDs even if their names changed. Receipts from a completed release can be used as the next installation receipt. A legacy `xpert-assistant-suite-installation@1` receipt is also accepted after its plugin and scope are checked. Without an installation receipt, supply the exact original `--run-id`; the CLI matches each profile base name plus that suffix and checks template provenance and primary Agent identity. It never adopts a different template with a colliding name.

Omitting `--refresh` creates a new suite with a unique run suffix and rejects existing names. `--dry-run` validates the local profile without network mutations. A release receipt is required for updates/recovery and is created automatically under `~/.xpert/assistant-suites/` for a new installation when no path is supplied.

Omitting `--environment-id` preserves each existing Assistant's environment. Supplying it overrides only the orchestrator's environment; role environments remain unchanged. Newly installed Assistants without an override publish with a null environment.

## Release ordering and preservation

1. Verify the plugin load status/version, every template and every existing Assistant before changing drafts.
2. Install or synchronize all drafts. Template refresh preserves installed tool/knowledge bindings, Assistant and Agent model selections, middleware model fields declared by provider schemas, and environment bindings. Tool references use exact IDs or explicit provider/component identity; ambiguous or missing matches fail before draft persistence.
3. Check that template content did not change during preparation.
4. Publish all roles in dependency order, then the orchestrator. Rebind existing external nodes to the newly published child descriptors before publishing each caller. Each Assistant publishes once as a new version.
5. Fetch and verify published graphs, models, environments and required child connections. Only then mark the receipt `readyForTesting`.

Roles removed from a previous installation receipt are disconnected from the updated suite but their historical Assistants are retained. Unrelated instance bindings are preserved. This command does not install plugins or perform business execution acceptance; a successful release means the suite is ready for those tests.

## Runtime compatibility after a plugin update

An installed Assistant's dependency locks record the versions and resource hashes used at installation. These automatic snapshots are not a requirement to republish the Assistant on every plugin update. At runtime, package version changes and changed selected resource definitions produce an advisory chat event; the published graph and installed bindings are not rewritten. Unrelated plugin resources are not inspected. The advisory does not claim that arbitrary code or business semantics have been proven compatible.

Runtime still rejects unavailable plugins/resources in the authorized scope, missing or reassigned providers, and partially activated registrations that disagree with the currently loaded plugin. Explicit `dependencies.versions` requirements remain exact constraints, recorded separately as `requiredVersion`; omit such a requirement when compatible plugin upgrades should be allowed. Old v2 publications retain their explicit constraints from template metadata. Immutable agent-plugin references continue to verify the pinned binding and artifact digest, rather than requiring the latest package.

Installation, preparation and interrupted-release recovery retain exact source/version/hash checks to avoid publishing a different artifact from the one that was prepared. These checks must not be globally relaxed to implement runtime compatibility. Tool parameter validation and business permissions also remain in their existing execution paths; there is no automatic inference of semantic compatibility from a package version or resource hash.

For example, an Assistant installed with Bid `0.6.62` can run with `0.6.63` when its dependencies remain available and it has no explicit conflicting version requirement. A template update can be recommended separately. Verify business behavior with a fresh execution; record plugin deployment, Assistant upgrade (if selected), and business acceptance separately.

## Resume a failed release

```sh
corepack pnpm assistant:suite:init \
  --profile "$SUITE_PROFILE" \
  --api-url "$XPERT_API_URL" \
  --org-id "$XPERT_ORG_ID" \
  --workspace-id "$XPERT_WORKSPACE_ID" \
  --resume \
  --manifest-file "$NEW_RELEASE_RECEIPT"
```

The receipt pins scope, profile, plugin/template content, target IDs, environment choices and per-role progress. Completed roles are verified and skipped. Prepared drafts are reused. A failed publication retries the same draft; an already committed publication whose response was lost resumes activation through `POST /api/xpert/:id/publication/resume` with its expected version.

Receipts are atomically replaced with mode `0600` and guarded against concurrent local writers. Changed scope, template content, published versions or outside draft edits cause recovery to stop. An interrupted template synchronization that changed the draft without a completed checkpoint has an unknown outcome: inspect that draft before starting a new release instead of blindly overwriting it. Individual database failures, completed checkpoints and lost publication responses are recoverable automatically with `--resume`.

## Publication failure semantics

Version backup, Agent/model writes and the published graph share one transaction. A failed tool foreign key, validation failure or stale snapshot leaves the prior version and draft intact. A row lock rejects concurrent publication from an older snapshot.

Trigger/event activation happens after commit. If it fails, the API returns `XPERT_PUBLICATION_ACTIVATION_PENDING` and the committed version. A server-owned checkpoint retains the previous trigger graph so recovery also handles removed or changed triggers. Recovery requires authoring permission and the expected published version, preserves any later user draft, and clears the checkpoint only after activation succeeds. New publication is blocked while activation is pending. The checkpoint is omitted from reusable DSL exports and ignored on import.

## Regression tests

```sh
corepack pnpm test:assistant:suite:init
XPERT_PUBLICATION_TEST_DATABASE_URL="$DISPOSABLE_POSTGRES_URL" \
  corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand \
  --runTestsByPath \
  packages/server-ai/src/xpert/commands/handlers/import.handler.spec.ts \
  packages/server-ai/src/xpert/commands/handlers/sync-template.handler.spec.ts \
  packages/server-ai/src/xpert/commands/handlers/publish.handler.spec.ts \
  packages/server-ai/src/xpert/template-sync/instance-bindings.spec.ts \
  packages/server-ai/src/xpert/publication/publication-persistence.postgres.spec.ts \
  packages/server-ai/src/xpert/publication/publication.controller.spec.ts \
  packages/server-ai/src/xpert/dto/xpert-dsl.dto.spec.ts
```

Use a disposable local PostgreSQL database. The transaction tests create and remove an isolated schema; they never require a production platform database.
