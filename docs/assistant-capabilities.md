# Assistant capabilities

Assistant capability configuration belongs to Open Source. A distribution or plugin
implements a capability through the SDK's `IAssistantCapabilityProvider` and registers
it with `@AssistantCapabilityProvider('stable-key')` in its Nest module. The scoped
registry uses the existing plugin strategy lifecycle and organization/tenant precedence.

## Declarations and selection

A template contribution or catalog descriptor can declare:

```ts
capabilities: [
  { key: 'document-analysis', required: true },
  { key: 'browser-automation', required: false }
]
```

Providers can also extend explicitly identified templates through `templates` entries.
This lets a distribution add optional features without editing the portable template.
Required declarations cannot be overridden by optional provider entries. Optional
capabilities are off by default and are offered only if a provider is registered.
Required or explicitly selected capabilities fail closed when the provider is absent.

## Lifecycle

1. `GET /xpert-template/:id/setup?capabilities=key1,key2` returns localized options,
   availability, required model features, and authorized model choices.
2. The generic service intersects all enabled providers' model requirements. Model
   listings use the existing governed query and return no provider credentials.
3. Installation first checks workspace author access, resolves a template variant,
   and composes its draft using each enabled provider's `apply` hook. Composition is
   deterministic and must not create resources or change external state.
4. Immediately before importing/publishing, the service reruns provider availability
   and model authorization checks. A stale setup result is never sufficient.
5. Optional selections are encoded in a stable `capabilities~…` template reference.
   The base template ID and sorted selection are recoverable; updating from the
   source template recomposes the same capabilities. This reference is an identifier,
   not authorization. Provider visibility and applicability are checked again.

Existing templates with no declared/provider-supplied capabilities keep their normal
initialization flow. The Desktop renders options from the API and has no capability ID
switches. The setup endpoint is backward compatible with older clients; the Desktop
supports older servers when no capability has been explicitly selected.

This is template initialization and update infrastructure. It does not silently enable
features on existing installed Assistants, grant tool permissions, start runtimes, or
replace runtime access checks. The Bosi editor uses the same provider contract for
explicit changes to installed Assistants.

## Distribution boundary

Open Source contains the contracts, SDK registry, setup/installation services and
Desktop UI. It ships no Cloud Computer provider. Pro registers `cloud-computer` from
its Computer module: it checks the configured Computer image and Docker provider,
requires vision plus tool calling, and composes Computer tools and instructions.
ClawXpert offers it as optional; the dedicated cloud computer template requires it.

Distribution catalog additions are declared in an optional `catalog-extensions.json`
alongside built-in assets. Each entry names a migration, source JSON file and introduced
template IDs. The shared upgrader adds missing entries once, preserving user overrides
and later intentional deletions. Pro owns its manifest and `pro-templates.json`.

## Create a blank digital expert

Bosi exposes **New digital expert** in **Discover & add → Digital experts**. Users choose an editable workspace, a name, an authorized model and optional capabilities; creation uses the existing governed import and publish flow and then opens the conversation. Every new expert receives a unique internal name.

The virtual `xpert-blank-assistant` seed has one Agent and no tools or sandbox enabled. It is not a marketplace template entry. Capability providers must explicitly set `availableForBlankAssistant: true` to appear. All choices default to off. `requiresModelSelection` allows this seed to require an explicit model even when no capability imposes model features. The server revalidates workspace access, capability availability and model authorization before creation.

OSS provides local command line and server sandbox capabilities. Local commands continue through Desktop Shell approval; enabling the capability does not grant execution permission. The server sandbox uses the configured provider. Pro additionally registers its cloud computer capability; portable creation UI and infrastructure contain no Pro-specific branch. Plugins remain selectable through the chat Plugins menu. Models, capabilities and instructions can be edited later in Bosi. Advanced workflow editing remains in Xpert Studio.

## Edit an existing assistant in Bosi

The **Edit profile** dialog separates personal display overrides from shared authoring:

- **Profile** changes the local description only, including for readers; the displayed name is read-only there.
- **Customize your assistant** edits the public name and avatar with workspace authoring permission. It updates only public profile metadata, without publishing or overwriting the workflow or its draft. See [Bosi onboarding and public appearance](bosi-desktop-onboarding.md).
- **Model & capabilities** and **Instructions** require authoring access to the assistant's workspace in the current organization. The workspace itself is not moved.
- **Save & publish** revalidates the allowed model and capability providers, saves a draft and publishes a new version. The dialog also works immediately after publishing, when the persisted graph is the editing baseline and no draft exists.
- User instructions are independent of generated capability instructions; both creation and editing support optional instructions. Clearing the user field keeps necessary capability instructions.
- Managed capability contributions carry provenance. Disabling a capability removes its contribution while keeping unrelated Studio changes. If Studio changed a managed contribution, editing stops with a conflict; review that workflow in Xpert.
- Original workflow capabilities without managed provenance remain built in. Advanced workflow changes continue to use Xpert Studio.
- Concurrent edits are checked with a revision. A failed publish is reported as a saved draft, and an uncertain request is never automatically retried.
