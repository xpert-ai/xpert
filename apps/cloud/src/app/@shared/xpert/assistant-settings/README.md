# Assistant settings Dialog

Shared Assistant settings component. Studio's existing Basic Info, Agent Settings and Features interfaces remain unchanged. The sidebar's Assistant settings action (formerly Workspace settings) opens this dialog directly; the standalone Assistant menu is removed. Old ClawXpert overview/settings URLs redirect to the conversation entry instead of rendering their old pages.

## Open the current bound Assistant

Call `settings.openBoundAssistant(viewContainerRef)` from the Assistant settings sidebar action. It resolves the current organization's user-level ClawXpert binding and opens Usage statistics by default without navigating. Missing or disabled bindings produce a clear message. The dynamic Assistant list remains available in the sidebar.

## Open a saved Assistant

```ts
import { ViewContainerRef, inject } from '@angular/core'
import { XpertSettingsService } from '@cloud/app/@core'

readonly settings = inject(XpertSettingsService)
readonly viewContainerRef = inject(ViewContainerRef)

async openSettings(xpertId: string) {
  const draft = await this.settings.open(this.viewContainerRef, xpertId, 'models')
  // Refresh the caller's displayed metadata if needed.
}
```

The service loads the editable draft through the existing organization-scoped API, lazily opens the CDK Dialog, and returns its final draft after closing. Optional initial section defaults to the last section used for that Assistant during this session. It never publishes.

## Use an active editor draft

Call `open(viewContainerRef, xpertId, section, source)` with an `XpertSettingsSource` adapter when the caller already owns an unsaved draft (especially Studio). Do not open a second server-backed draft alongside an active editor store.

The adapter exposes the current draft signal, immutable runtime data scope, `saving`, `unsaved`, and `error` signals, plus:

- `update(change)` applies the immutable callback to the latest draft and marks it unsaved.
- `save()` persists the latest snapshot, rejects on failure, and updates the status signals. Serialize writes with the editor's other saves. Do not clear unsaved state if the current draft differs from the saved snapshot.

The adapter contract is independent of Studio. Optional `reload()` refreshes an unmodified draft; it must preserve local edits and use the same organization context.

For manual `Dialog.open`, import `XpertSettingsDialogComponent` and provide `XpertSettingsDialogData`: `{ source, section, selectSection, organizationId, binding? }`. Only pass a verified, enabled user binding that matches the source Assistant to expose Personalization. Prefer the service, which resolves the binding and closes on organization/binding changes. Use `disableClose: true`, `backdropClass: 'backdrop-blur-xs-black'`, and `panelClass: ['xp-overlay-pane-dialog', 'xp-overlay-pane-assistant-settings']`; the component handles Escape/backdrop closing while preserving unsaved edits. Provide a translated `ariaLabel`.

## Categories and source fields

| Category           | Previously located in             | Edited fields                                                                                              |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| General            | Basic Info                        | avatar, title, description, tags; name and runtime data scope are read-only                                |
| Models             | Basic Info                        | primary model and ordered user-selectable models                                                           |
| Conversation       | Features                          | opener, frequent questions, follow-up suggestions, title generation                                        |
| Workbench & layout | Agent Settings                    | first layout and default extension view                                                                    |
| File uploads       | Features                          | enabled, file types, upload count; hidden source mode is preserved                                         |
| Speech             | Features                          | TTS and speech recognition models                                                                          |
| Memory & context   | Features                          | summary, profile/Q&A memory, memory replies; link to existing memory management                            |
| External experts   | Agent canvas external Xpert nodes | Search and assign a published workspace expert to an agent; inspect or remove assignment                   |
| Sub-agents         | Agent canvas internal Agent nodes | Add/edit title, description, prompt, model, parent, independent context and always-available setting       |
| Runtime & sandbox  | Agent Settings + Features         | concurrency, recursion limit, sandbox provider                                                             |
| Personalization    | Old Assistant settings dialog     | SOUL.md behavior and USER.md profile for the current user's matching binding                               |
| Assistant settings | Old Assistant settings dialog     | trigger providers, configuration, connection state and integration creation                                |
| Usage statistics   | Old Workspace settings overview   | companion days when bound, conversation/task counts and 12 calendar weeks of current-user message activity |

Only valid, edited fields are merged into the current draft. Unknown configuration, node overrides, graph geometry, connections, and untouched defaults are preserved. A legacy primary node model matching the inherited team model is cleared only when the primary model changes, following existing Basic Info behavior.

Valid draft field changes auto-save after 600 ms. Invalid edits stay in the form across category changes and are identified in navigation. Personalization uses explicit Save/Reset and the binding preference API, never the Assistant draft API; its unsaved form stays mounted across category changes. Sub-agent forms also use explicit Save/Reset and stay mounted across category changes. Closing protects invalid draft inputs, unapplied sub-agent edits and unsaved personal documents. Failed saves keep the dialog open with a retry action. Ctrl/Cmd+S saves the current editable category.

The optional `ASSISTANT_SETTINGS_CONTEXT` adapter lets the existing personalization/trigger components use the same active dialog draft without depending on the ClawXpert page facade. Trigger configuration preserves unrelated graph/form changes. QR connections retain their existing immediate activation semantics; other trigger changes require publication. Statistics are read-only, with loading/error/retry states.

The four layout previews live in `assets/images/assistant-settings/`. All text uses `XP.XpertSettings` translations and existing shared controls; colors use theme tokens. The compact layout uses Zard Select below the small-screen breakpoint. Collapsible feature settings use Zard Accordion with an independent enable switch. The sidebar header shows the Assistant avatar, name and translated draft identity.

## Density and corner radii

`xpert-settings-dialog.component.css` defines two tokens on the dedicated CDK panel class. The shared dialog surface still owns clipping, background, borders and elevation. No global theme radius is changed.

| Token / utility                         | Value                                                                          | Applies to                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `--assistant-settings-dialog-radius`    | `24px`                                                                         | CDK dialog surface                                                             |
| `--assistant-settings-item-radius`      | `12px`                                                                         | Search, navigation, model selectors/lists, file rows, layout and trigger cards |
| `text-base` / `text-lg` / `text-sm`     | Theme defaults                                                                 | Body / headings / descriptions; no font token overrides                        |
| `px-4 sm:px-5 py-3`                     | `12px` vertical; `16px` mobile / `20px` desktop horizontal                     | Header and content                                                             |
| `p-3`                                   | `12px`                                                                         | Sidebar                                                                        |
| `py-2`                                  | `8px` per side                                                                 | Feature sections and footer; first feature omits top padding                   |
| `px-2.5 py-0.5 min-h-8`                 | `10px` horizontal / `2px` vertical; `32px` minimum height; no gap between rows | Navigation rows                                                                |
| `px-3 py-2`                             | `12px` horizontal / `8px` vertical                                             | Trigger, layout and statistics cards                                           |
| `space-y-3` / `space-y-4` / `space-y-5` | `12px` / `16px` / `20px`                                                       | Feature details / grouped fields / larger sections                             |
| `h-10` / `size-10`                      | `40px`                                                                         | Normal text buttons / square close button                                      |
| `h-8` / `min-h-10`                      | `32px` / `40px`                                                                | Search field / file type rows                                                  |
| Dialog size                             | Maximum `1120 x 780px`                                                         | Desktop; keeps viewport margins and the existing mobile layout                 |
| Sidebar width                           | `224px` / `240px`                                                              | Small desktop / large desktop                                                  |

Spacing remains scoped to this dialog, including overrides for reused personalization and trigger components. Existing interfaces retain their own presentation. List item corners use `rounded-[var(--assistant-settings-item-radius)]`, so both radius values can be tuned in one place without following the app's root font size.

Sandbox provider and default Workbench view use Zard Select, including the empty/default choices and unavailable saved values. The default view choice still stores `null`; clearing the sandbox provider still stores an empty string and retains the enabled-sandbox validation.

Select radius overrides must apply to both the `z-select` host (focus ring) and its direct button (border), using `--assistant-settings-item-radius` for both. Overriding only the button leaves the focus ring at Zard's default `rounded-md` radius.

## Verification

```sh
corepack pnpm exec jest --config apps/cloud/jest.config.ts --runInBand --runTestsByPath apps/cloud/src/app/@shared/xpert/assistant-settings/xpert-settings.spec.ts apps/cloud/src/app/@shared/xpert/assistant-settings/settings-model-select.component.spec.ts apps/cloud/src/app/@core/services/xpert-settings.service.spec.ts
corepack pnpm exec ngc -p apps/cloud/tsconfig.app.json --noEmit
corepack pnpm theme:check-hardcoded-colors
```

## Delegation menus

External experts use published assistants from the current editable workspace. The chooser excludes the current assistant/version family and existing assignments, loads candidates with pagination and stores an `xpert` node plus its caller connection in the same draft. New assignments explicitly set `required: true` so ChatKit runtime capability allowlists keep the tool available. This permits delegation; it does not force every conversation to call the expert. Removing an assignment preserves the published expert.

Sub-agents are internal `agent` nodes, excluding the primary and hidden workflow entry nodes. Parent selection excludes self and descendants. Saving merges into the latest draft, preserving node positions, downstream connections and unrelated options. Clearing the model restores inheritance. Tools, knowledge, complex graph connections and deletion remain available through the existing agent canvas link. Neither menu publishes automatically.

## Skills and middleware menus

Both menus default to the primary agent and allow selecting another visible agent. Skills use the shared `SKILLS_MIDDLEWARE_NAME` provider contract and the existing JSON Schema skills selector. The middleware menu lists the other providers and excludes providers marked as non-addable. Configuration reuses `JSONSchemaFormComponent`, including workspace-scoped widgets and agent variables, and exposes the existing required flag and tool switches.

New assignments create middleware workflow nodes and agent-to-workflow connections, preserving execution order in the agent node and primary team metadata. Only one skills middleware is permitted per agent. Removing a shared middleware detaches the selected agent without deleting another agent's configuration; editing a shared node shows which other agents are affected. Existing provider options and tool configuration survive editing.

The panels load on first use, remain mounted across menu changes, and require explicit saving. Pending forms participate in the dialog's close guard and Ctrl/Cmd+S handling. API failures retain the draft for retry. These menus never publish automatically.
