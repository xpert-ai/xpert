# Project configuration plugin

`ProjectConfigurationPluginModule` owns the View provider, editor services, input schemas and portable UI in this directory. It imports no host module, business service, entity, repository or CommandBus. The host imports this module once; plugin providers are not also registered in `XpertProjectModule`.

The plugin calls the SDK's `ProjectConfigurationApi` through the typed `ProjectConfigurationRuntimeCapability` (`platform.project.configuration`). The host implementation lives in `xpert-project/configuration/runtime` and delegates to existing domain services. Generic configuration persistence stays in `xpert-project/configuration`, shared Commands/Handlers stay in `xpert-project/commands`, and OAuth launch stays in the connector domain. Only the host implementation uses internal CQRS or repositories.

`platform.project-configuration__configuration` is shared by the Cloud Project route and the Assistant Workbench. The Assistant entry is on demand, requires `project.tasks`, and appears only with a current Project.

The React View contains portable editors for type settings, experts, members, skills, connectors, automations and deletion. It uses public View data/actions/file actions; no Cloud editor command or Angular dialog is required. A host must support the existing remote-component protocol and file actions, and OAuth launch links require popups that can leave the iframe sandbox.

Plugin services parse raw View inputs and map page actions to concrete business methods such as `get`, `update`, `inviteMember` and `saveAutomation`. Only the View provider translates authenticated View context into `ProjectConfigurationScope`; the public API receives a trusted actor, project ID and optional Assistant ID, with no View protocol types. The host checks that this scope matches the current execution identity, revalidates access and Assistant binding on every call, and never accepts identity or project overrides from an action payload. Scope is not cached on the singleton service. Non-View callers use the same API after restoring their trusted execution identity. This does not grant machine principals human management or consent permissions; browser OAuth launch still requires an authenticated HTTP origin. Existing Project access, task, file and pipeline APIs remain separate. Configuration revisions, membership rules, run-as consent, connector authorization and deletion remain enforced by their owning services. The public projection excludes stored credentials and Assistant authoring graphs. Credentials entered in the connector editor are submitted through an authorized action and cleared after a successful connection request.

Type settings render primitive and nested object fields, with JSON editing for arrays, free-form objects and composed schemas. Schema enums accept all JSON configuration values: primitive-only enums use a selector, while enums containing objects or arrays use JSON editing, preserving their structure. The server remains authoritative for JSON Schema validation, including enum membership. Project/context changes close editors and discard previous-project drafts; theme-only updates preserve the current draft.

OAuth uses a random, one-use Redis ticket with at most two minutes to launch. The public launch endpoint validates the ticket, sets a callback-scoped HttpOnly browser-binding cookie and redirects to the provider. Expired or reused tickets cannot launch again. Status polling is limited to pending authorizations opened by the current editor and stops on close or expiry.

## Validation

- Build: `node packages/server-ai/src/xpert-project/plugins/project-configuration/remote-components/project-configuration/build.mjs`.
- Asset freshness: the same command with `--check`.
- Remote typecheck: `tsc -p packages/server-ai/src/xpert-project/plugins/project-configuration/remote-components/project-configuration/tsconfig.check.json --noEmit` after building contracts.
- Browser tests: `node --test tools/testing/project-configuration.e2e.mjs`. Uses the isolated Preview Host with this checkout's source renderer, independent of `plugin-sdk/dist`; covers editing, read-only state, run-as consent UI, context/theme changes, OAuth popup cookie access, schema fallback, structured enums, dark mode and narrow layouts.
- Plugin tests instantiate the complete module with only an SDK capability registry, verify stable-ID lookup with an independently created key, validate inputs, and reject source imports across the plugin boundary.
- Host tests in `configuration/runtime` cover per-call identity, project switching, revoked access, scoped actions, configuration permissions and task ownership. Connector tests cover OAuth HTTP/cookie boundaries.
- Cloud tests cover the View outlet, project/user changes and iframe policy.

The preview emulates public actions; it does not prove a real OAuth provider connection or installed-platform acceptance. Production builds discover this remote component and copy its generated assets using the existing server build rules. Generated JS/CSS are not committed.
