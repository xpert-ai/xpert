// Discovered references are projections, never grants or persisted installations.
// Rebuild them in the caller's scope on every execution and compare the exact version.
import { createHash } from 'node:crypto'
import Ajv from 'ajv'
import {
    getAgentMiddlewareNodes,
    isUserAddableAgentMiddleware,
    normalizeMiddlewareProvider,
    resolveI18nText,
    type IXpert,
    type IWFNMiddleware,
    type RuntimeResourceDefinition,
    type RuntimeResourceCatalogItem,
    type RuntimeResourceKind
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import type { AgentResourceBinding } from './agent-plugin.entity'
import { isSameXpertFamily } from '../xpert/xpert-family'
import { publishedResourceVersion } from './published-resource-version'

export type RuntimeResourceBinding = Pick<
    AgentResourceBinding,
    | 'id'
    | 'title'
    | 'description'
    | 'version'
    | 'workspaceIds'
    | 'definition'
    | 'installations'
    | 'expertVersions'
    | 'enabled'
    | 'supersededById'
> &
    Pick<RuntimeResourceCatalogItem, 'icon' | 'avatar' | 'iconDefinition'>

type Scope = { tenantId: string; organizationId: string }

function digest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function discoveredBinding(
    scope: Scope,
    assistant: IXpert,
    identity: string,
    definition: RuntimeResourceDefinition,
    revision: unknown
): RuntimeResourceBinding {
    const key = digest([
        'runtime-resource-v1',
        scope.tenantId,
        scope.organizationId,
        assistant.workspaceId,
        definition.kind,
        identity
    ])
    // UUID format preserves the existing SDK and stored selection contract.
    const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`
    return {
        id,
        version: digest([id, definition, revision]),
        title: identity,
        workspaceIds: [assistant.workspaceId],
        definition,
        installations: {},
        expertVersions: {},
        enabled: true
    }
}

export function isResourceInGraph(binding: RuntimeResourceBinding, assistant: IXpert) {
    const definition = binding.definition
    if (definition.kind === 'middleware') {
        return (
            !!assistant.graph &&
            !!assistant.agent &&
            getAgentMiddlewareNodes(assistant.graph, assistant.agent.key).some(
                (node) =>
                    normalizeMiddlewareProvider((node.entity as IWFNMiddleware).provider) ===
                    normalizeMiddlewareProvider(definition.provider)
            )
        )
    }
    if (definition.kind === 'external_xpert') {
        return (
            definition.xpertId === assistant.id ||
            assistant.graph?.nodes?.some((node) => node.type === 'xpert' && node.entity.id === definition.xpertId) ||
            assistant.agent?.collaborators?.some((expert) => expert.id === definition.xpertId)
        )
    }
    return false
}

export function discoverRuntimeResources(input: {
    scope: Scope
    assistant: IXpert
    bindings: RuntimeResourceBinding[]
    experts: IXpert[]
    registry: AgentMiddlewareRegistry
    kind?: RuntimeResourceKind
    catalog: boolean
}): RuntimeResourceBinding[] {
    const { scope, assistant, experts, registry, kind, catalog } = input
    const bindings = input.bindings.filter(
        (binding) => binding.workspaceIds.includes(assistant.workspaceId) && (catalog || !binding.enabled)
    )
    const result: RuntimeResourceBinding[] = []
    if (!kind || kind === 'external_xpert') {
        const configured = [
            ...(assistant.agent?.collaborators ?? []),
            ...(assistant.graph?.nodes ?? []).flatMap((node) => (node.type === 'xpert' ? [node.entity] : []))
        ]
        const managed = bindings.flatMap((binding) =>
            binding.definition.kind === 'external_xpert' ? [binding.definition.xpertId] : []
        )
        const byId = new Map(experts.map((expert) => [expert.id, expert]))
        const seen: IXpert[] = []
        const ordered = [...experts].sort(
            (a, b) =>
                publishedResourceVersion(b.publishAt).localeCompare(publishedResourceVersion(a.publishAt)) ||
                a.id.localeCompare(b.id)
        )
        for (const expert of ordered) {
            const revision = publishedResourceVersion(expert.publishAt)
            if (!revision || !expert.agent || isSameXpertFamily(assistant, expert)) continue
            // Explicit management (including disable) takes precedence over discovery.
            if (managed.some((id) => id === expert.id || (byId.has(id) && isSameXpertFamily(byId.get(id), expert))))
                continue
            if (
                catalog &&
                (configured.some((item) => isSameXpertFamily(item, expert)) ||
                    seen.some((item) => isSameXpertFamily(item, expert)))
            )
                continue
            seen.push(expert)
            const binding = discoveredBinding(
                scope,
                assistant,
                expert.id,
                { kind: 'external_xpert', xpertId: expert.id },
                revision
            )
            binding.title = expert.title || expert.name
            binding.description = expert.description
            binding.expertVersions[expert.id] = revision
            binding.icon = expert.avatar?.url
            binding.avatar = expert.avatar
            result.push(binding)
        }
    }
    if (!kind || kind === 'middleware') {
        const seen = new Set<string>()
        const ajv = new Ajv({ strict: false, validateSchema: false, useDefaults: true })
        for (const strategy of registry.list(scope.organizationId)) {
            const meta = strategy.meta
            const provider = normalizeMiddlewareProvider(meta.name)
            if (!isUserAddableAgentMiddleware(meta) || meta.deprecated || seen.has(provider)) continue
            seen.add(provider)
            if (
                bindings.some(
                    (binding) =>
                        binding.definition.kind === 'middleware' &&
                        normalizeMiddlewareProvider(binding.definition.provider) === provider
                )
            )
                continue
            const options: Extract<RuntimeResourceDefinition, { kind: 'middleware' }>['options'] = {}
            try {
                if (meta.configSchema && !ajv.compile(meta.configSchema)(options)) continue
            } catch {
                // A malformed provider schema cannot hide otherwise usable resources.
                continue
            }
            const binding = discoveredBinding(scope, assistant, provider, { kind: 'middleware', provider, options }, [
                meta.configSchema,
                registry.getSource(strategy)
            ])
            if (catalog && isResourceInGraph(binding, assistant)) continue
            binding.title = resolveI18nText(meta.label, RequestContext.getLanguageCode()) || provider
            binding.description = resolveI18nText(meta.description, RequestContext.getLanguageCode()) || undefined
            if (meta.icon?.type === 'image') binding.icon = meta.icon.value
            binding.iconDefinition = meta.icon
            result.push(binding)
        }
    }
    return result
}
