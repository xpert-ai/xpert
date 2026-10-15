# Template sub-agent validation — 2026-10-15

## Result and limits

Automated tests cover catalog selection, delegation, the production graph compiler, lifecycle and authorization. **Two real authenticated ChatKit → model → template sub-agent tasks passed acceptance on 2026-10-15.** After the user authorized removal of the remaining failed plugins, the selected source API returned HTTP 200 / `ready`, official authentication succeeded, and the dedicated package and parent Assistant were provisioned through the normal APIs.

The independent ChatKit source page at `http://127.0.0.1:5179` proxies to `http://localhost:3333`. A loopback-only acceptance host at `http://127.0.0.1:5178` supplies an authorized, short-lived user session through the existing parent message bridge. Credentials stay in memory and do not appear in URLs. Browser interaction selected the package from the real plugin menu and submitted both tasks.

The automated run covered the uncommitted feature tree based on Xpert commit `5afe7d1d79e1f5865ec17ad658608ec401804c5a`, plus the companion ChatKit and SDK working trees. During live acceptance, HEAD was `98d70042185b46fd3febf0ebba975bca4b1f76bd`; the intervening commit changes desktop avatar/accent presentation, not this backend feature. Tests used existing local dependencies; they do not establish a clean frozen-lockfile release build or remote CI success.

## Automated results

| Scope                              | Runtime and command                                                                                   | Result                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ChatKit root workflow test scope   | Node 24.22.0, Corepack pnpm 10.11.0; `corepack pnpm test`                                             | 295 files, 2,267 tests passed. The root script excludes UI5.                           |
| Xpert SDK full Vitest scope        | Node 24.22.0, Corepack pnpm 10.18.3; `corepack pnpm test --run`                                       | 21 files passed, 1 skipped; 165 tests passed, 4 skipped.                               |
| Backend expanded related scope     | Node 22.17.1, Corepack pnpm 10.24.0; Jest server-ai config, `--runInBand --runTestsByPath` in batches | 193 files: 185 passed, 5 failed, 3 skipped. Tests: 1,555 passed, 2 failed, 33 skipped. |
| Latest security/runtime rerun      | Same backend runtime; 9 selected files listed below                                                   | 85 tests passed. These overlap the expanded scope and are not additional tests.        |
| SDK TypeScript                     | `corepack pnpm --filter @xpert-ai/xpert-sdk exec tsc --noEmit`                                        | Passed.                                                                                |
| ChatKit against modified SDK types | Isolated SDK declaration build and temporary ChatKit tsconfig mapping to that build                   | Passed; published dependency/lockfile update still required before release.            |

The backend scope includes agent-plugin, agent-invocation, plugin-resource, xpert-agent, xpert-template, Assistant file/setup/lifecycle, volume, execution, shared Agent, connector, published-access, workspace-access and project-access tests. It is an expanded related scope, not every backend test in the repository. A first single-process run exhausted its default heap; splitting the same scope into batches completed collection without increasing the heap. Counts above consolidate the latest result for each file, including the final rerun.

Final focused rerun:

```sh
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath \
  packages/server-ai/src/agent-plugin/templates/template-project-authorization.spec.ts \
  packages/server-ai/src/agent-plugin/templates/runtime-template.spec.ts \
  packages/server-ai/src/plugin-resource/template-installation/template-readiness.service.spec.ts \
  packages/server-ai/src/xpert-project/services/project-access.service.spec.ts \
  packages/server-ai/src/xpert/assistant-files/assistant-files.integration.spec.ts \
  packages/server-ai/src/xpert-agent/template-subagents/template-task-context.spec.ts \
  packages/server-ai/src/xpert-agent/template-subagents/template-subagent-runtime.spec.ts \
  packages/server-ai/src/xpert-agent/template-subagents/template-subagents.middleware.spec.ts \
  packages/server-ai/src/shared/agent/execution-definition.spec.ts
```

### Existing failing and skipped tests

All five failing files also fail in an isolated `git archive HEAD` baseline using the same dependency installation:

| File below `packages/server-ai/src/`                                 | Baseline failure                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `shared/agent/middleware-runtime/middleware-runtime.service.spec.ts` | Test fixture supplies two constructor arguments where KnowledgebaseRuntimeService requires three. |
| `xpert-template/commands/template-commands.spec.ts`                  | Test module does not provide TemplatePublicationStore.                                            |
| `xpert-template/capabilities/bosi-template-resolution.spec.ts`       | Test fixture supplies two constructor arguments where AssistantCapabilityService requires three.  |
| `xpert-template/capabilities/template-capability-api.spec.ts`        | Stale setup stub produces an undefined setup/canInstall failure.                                  |
| `xpert-agent/commands/handlers/types.spec.ts`                        | Test imports removed token/context helper exports.                                                |

The skipped backend files are `invocation-wait.integration.spec.ts`, `activity.integration.spec.ts` and `package-maintenance.integration.spec.ts`; their external-environment gates were not satisfied. No skip was added to hide a feature failure. These results must not be described as an entirely green backend run.

## Authorization and isolation

| Boundary                    | Evidence                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Standalone Assistant access | Real PublishedXpertAccessService, Assistant file authorization and CQRS dispatch accept an authorized run-only user; revoke the grant and the next authorization fails even with a previously issued USER_XPERT audience.                  |
| Project access              | Real ProjectAccessService and CQRS dispatch accept current Project membership plus Assistant binding without requiring standalone Assistant-file access. Membership removal, binding removal and archived projects fail subsequent checks. |
| Scope mismatch              | Tenant, organization, Assistant and Project mismatches fail before dependency preparation or task-state creation.                                                                                                                          |
| Forged template selection   | Modified binding ID, version, digest, package name or template key is rejected.                                                                                                                                                            |
| Cached invocation replay    | Authorization runs before returning an already completed invocation's result; a cached result does not bypass revoked access.                                                                                                              |
| Task initialization         | Authorization runs before creating task directories and writing template initialization files. The rejection test verifies that the root stays empty.                                                                                      |
| Runtime definition trust    | Only host-created definitions are accepted; ordinary serialized/request data cannot impersonate an authorized definition.                                                                                                                  |
| State separation            | Separate invocation/checkpoint/cancellation and task-file namespaces; explicit inputs only; no inherited parent messages, environment or dynamic selection; no Assistant creation/publication or routine registration.                     |

Authorization integration tests execute production policy services with controlled fake persistence and real local filesystem operations. They are stronger than always-allow service mocks, but **are not live database tests with two independently authenticated users**. The automated graph test executes the production compiler and LangGraph with a scripted model and controlled dependencies. The real acceptance below additionally exercises the configured model and persisted execution records with an authenticated user; real connector credentials and durable distributed recovery under process failure remain outside this live test.

## Deployable real-acceptance fixture

The dedicated package is in `packages/server-ai/src/xpert-agent/template-subagents/fixtures/expense-review/`. Its package role is `subagent`; existing `assistant` packages remain unchanged. The production package parser and runtime normalizer load it without diagnostics, preserve both Agent nodes and the required Agent connection, and leave the model unset for the parent's authorized fallback.

Graph:

```text
Published acceptance parent
  → selected package's template delegation tool
    → ExpenseReview
      → MathVerifier
    ← verified result
  ← parent response
```

Use a normal authorized parent Assistant with a configured model. Import the fixture as an Agent Plugin ZIP with `plugin.json` at its root, then select the package through the actual ChatKit plugin menu. Capture the Assistant count/publication state after provisioning the parent and before executing the task.

Suggested task:

> 请调用所选插件里的费用复核子智能体。费用明细：单价 240 元、数量 3；单价 99 元、数量 4；单价 149 元、数量 2。预算 1500 元。请由模板内部的计算 Agent 复核，并告诉我合计、预算余额和是否超预算。

Expected arithmetic: line totals `[720, 396, 298]`, total `1414`, budget `1500`, remaining `86`, `within_budget: true`. The template declares reviewer receipt `expense-template-v1` and calculator receipt `math-verifier-v1`.

Acceptance must additionally show all of the following; correct arithmetic or model-written receipt text alone is insufficient:

1. The package appears in ChatKit and exposes its template; selecting it alone starts no sub-agent.
2. The parent model actually calls the generated template tool.
3. Execution records show the pinned package/template source, parent execution/tool-call linkage and the internal MathVerifier execution.
4. The result returns to the parent and appears in ChatKit.
5. No extra workspace Assistant is created or published by delegation.
6. A second call has its own state; replay of a completed call uses its recorded result and still revalidates access.

## Real ChatKit acceptance

The production package parser accepted `template-subagent-acceptance@1.0.0` without diagnostics. ChatKit displayed its `assistant_template` component as “子智能体 · 费用复核子智能体 · 可用”; the package was added through its detail dialog. The dedicated parent was imported and published using the current organization's primary model, `qwen3.6-plus`. Both child Agents inherited that effective model.

| Trial                          | Input                                       | Actual result                                |
| ------------------------------ | ------------------------------------------- | -------------------------------------------- |
| First call                     | `240 × 3 + 99 × 4 + 149 × 2`, budget `1500` | Total `1414`, remaining `86`, within budget. |
| Second call, same conversation | `110 × 2 + 80 × 3`, budget `500`            | Total `460`, remaining `40`, within budget.  |

Both persisted execution trees contain successful `TemplateAcceptanceParent → ExpenseReview → MathVerifier` nodes. API inspection verified:

- The template execution records the selected package binding/version, content digest and `expense-review` template key.
- Each child links to its actual parent execution and originating tool call.
- Every node remains owned by the parent Assistant.
- The two template calls have distinct checkpoint namespaces; each internal Agent also has a separate checkpoint namespace.
- The internal calculation output contains the correct line totals and `math-verifier-v1` receipt; the template output contains `expense-template-v1` and the returned calculator receipt.
- The UI displays the nested calculation task as completed and the parent reports the computed result.
- After the dedicated parent was provisioned, the workspace contained 131 Assistants. It still contained the exact same 131 IDs, versions and statuses after both delegations. No workspace Assistant was created or published by delegation.

The second model response represented `line_totals` as item objects with a numeric `total`, whereas the first used numbers. The fixture asks for an array but does not declare a strict output JSON schema; verification compared the actual line amounts in both forms. This tests delegation and arithmetic, not enforced output-schema conformance.

This live run covers a pure-template package, a complete internal two-Agent graph, parent-model fallback, menu selection, persisted provenance, result delivery and consecutive-call isolation. Other roles, mixed MCP/skill packages, negative authorization, approval resume, cancellation, concurrent calls and replay retain the automated coverage described above; they were not all repeated with a real model.

## Environment recovery history

On the initial attempt, the chosen Xpert source started on port 3333, but readiness stayed unready and normal login returned 503. The installation reported these startup failures:

- Old `acceptance-template-*` / `acceptance-office-sync-*` packages do not export a valid XpertPlugin.
- The registered unlimited-ocr workspace path no longer exists; its staged package cannot be loaded. Another registered office-ops workspace path is also missing.
- The installed Lark package requires `ANALYTICS_PERMISSION_SERVICE_TOKEN`, which this source checkout's plugin SDK does not export.
- Runtime admission cannot match the required installed plugin state, including recovery from the previously failed generation.

The initial task-owned API process was stopped after diagnosis. No unrelated plugin was disabled, no runtime admission was bypassed and no database or Redis control state was rewritten. The other checkout's UI on port 4300 was left running. The independent ChatKit source dev page remains separate from it.

After the user reported repairing the plugins, the same source API was restarted on 2026-10-15 at 16:30 Asia/Shanghai. Its listener and working directory were verified. The Lark export failure no longer appeared, but the five old acceptance packages still failed the XpertPlugin export check, and the unlimited-ocr/office-ops workspace paths were still missing. Repeated readiness checks after startup returned HTTP 503 with `status: unready`. The API child subsequently exited with SIGKILL and port 3333 stopped listening; the watcher remained waiting for file changes. This retry did not reach authentication or real template execution. The fresh protected log is `api-after-plugin-repair.log` in the environment receipt directory.

The user then explicitly requested removal of every failing plugin and a restart. Because the unavailable API also blocked its uninstall endpoint, offline maintenance backed up and removed exactly seven failed registrations and their installation-manifest entries, and quarantined their staged runtime directories. It used the production generation publisher to record seven `absent` requirements, retained unrelated requirements and did not force readiness or mark the generation successful. Only prior-attempt flags were cleared from the backed-up startup snapshot, following the documented recovery procedure; the good snapshots were retained.

The seven removed packages were `@community/packages-office-ops`, `@xpert-ai/plugin-unlimited-ocr`, `@xpert-ai/acceptance-template-batch03`, `@xpert-ai/acceptance-template-dependency`, `@xpert-ai/acceptance-template-batch04-06`, `@xpert-ai/acceptance-template-batch07-10` and `@xpert-ai/acceptance-office-sync-batch11-14`. The repaired Lark installation was retained.

The subsequent source restart passed readiness. After normal authentication, the removal scope matched the authorized organization and `/api/plugin/by-names` returned zero descriptors for those seven packages. API readiness was checked again after real acceptance and remained `ready`. No account authorization denial was bypassed; the earlier HTTP 503 represented runtime unavailability.

## Local evidence

Detailed machine-local evidence is retained outside source control:

- `/tmp/template-subagent-chatkit-full.log`
- `/tmp/template-subagent-sdk-full.log`
- `/tmp/template-subagent-comprehensive-batch-{1..8}.json` and `.log`
- `/tmp/template-subagent-consolidated-results.json`
- `/tmp/template-subagent-final-security-results.json`
- `/tmp/template-subagent-baseline-results.json`
- Protected API/UI process receipts and logs under the workspace's `.xpert-local-environment/template-subagent-20261015/` directory.
- In that directory: `real-acceptance-result.json`, `execution-trees-private.json`, `failed-plugin-removal-result.json`, `failed-plugin-removal-backup/`, `api-after-failed-plugin-removal.log`, `chatkit-template-details.jpg`, `chatkit-template-result.jpg` and `chatkit-template-second-result.jpg`.

Runtime identifiers, authentication data and organization/workspace mappings are not included in this document or the reusable fixture.
