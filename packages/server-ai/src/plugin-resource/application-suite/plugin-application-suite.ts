import {
    omitXpertRelations,
    type IXpert,
    type PluginMarketplaceAppAssistantSuite,
    type TXpertTeamDraft
} from '@xpert-ai/contracts'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { t } from 'i18next'

// Invariant: provisioning an Assistant does not grant coordinator delegation.
// Standalone Assistants are published and checked, but must stay out of its graph.
export function applicationSuiteAssistants(suite: PluginMarketplaceAppAssistantSuite) {
    return [...suite.roles, ...(suite.standaloneAssistants ?? [])]
}

function invalidTopology(code: string) {
    return new BadRequestException({
        code,
        message: t('server-ai:Error.ApplicationSuiteInvalidTopology', {
            defaultValue:
                'The application Assistant delegation topology is invalid. Check role references, duplicate links, cycles and unreachable roles.'
        })
    })
}

export function validateApplicationSuite(suite: PluginMarketplaceAppAssistantSuite, coordinatorTemplate: string) {
    if (
        !suite.version?.trim() ||
        !suite.coordinatorAgentKey?.trim() ||
        !Array.isArray(suite.roles) ||
        suite.roles.length < 1 ||
        (suite.standaloneAssistants !== undefined && !Array.isArray(suite.standaloneAssistants)) ||
        suite.roles.length + (suite.standaloneAssistants?.length ?? 0) > 20
    ) {
        throw new BadRequestException('invalid_application_assistant_suite')
    }
    const keys = new Set<string>(),
        templates = new Set<string>()
    for (const role of applicationSuiteAssistants(suite)) {
        if (
            !/^[a-z][a-z0-9_-]*$/.test(role.key) ||
            !role.templateKey?.trim() ||
            !role.primaryAgentKey?.trim() ||
            keys.has(role.key) ||
            templates.has(role.templateKey) ||
            role.templateKey === coordinatorTemplate
        ) {
            throw new BadRequestException('invalid_application_assistant_role')
        }
        keys.add(role.key)
        templates.add(role.templateKey)
    }
    applicationSuiteRoleOrder(suite)
}

/** Validate the delegation DAG and return dependencies before their callers. */
export function applicationSuiteRoleOrder(suite: PluginMarketplaceAppAssistantSuite) {
    const roles = new Map(suite.roles.map((role) => [role.key, role]))
    const checkedKeys = (keys: string[]) => {
        if (!Array.isArray(keys) || new Set(keys).size !== keys.length || keys.some((key) => !roles.has(key))) {
            throw invalidTopology('invalid_application_suite_dependencies')
        }
        return keys
    }
    const roots = checkedKeys(suite.coordinatorRoleKeys ?? suite.roles.map((role) => role.key))
    for (const role of suite.roles) checkedKeys(role.externalRoleKeys ?? [])
    if (suite.standaloneAssistants?.some((role) => role.externalRoleKeys?.length)) {
        throw invalidTopology('invalid_application_suite_dependencies')
    }
    const visited = new Set<string>(),
        visiting = new Set<string>()
    const ordered: PluginMarketplaceAppAssistantSuite['roles'] = []
    const visit = (key: string) => {
        if (visiting.has(key)) throw invalidTopology('application_suite_dependency_cycle')
        if (visited.has(key)) return
        visiting.add(key)
        const role = roles.get(key)
        for (const dependency of role.externalRoleKeys ?? []) visit(dependency)
        visiting.delete(key)
        visited.add(key)
        ordered.push(role)
    }
    // Every delegated role must be reachable from the entry.
    for (const key of roots) visit(key)
    if (visited.size !== roles.size) throw invalidTopology('application_suite_role_unreachable')
    return ordered
}

function delegation(suite: PluginMarketplaceAppAssistantSuite, roleKey?: string) {
    const role = roleKey ? applicationSuiteAssistants(suite).find((entry) => entry.key === roleKey) : undefined
    if (roleKey && !role) throw new ConflictException('application_role_missing')
    return {
        primaryAgentKey: role ? role.primaryAgentKey : suite.coordinatorAgentKey,
        keys: role
            ? (role.externalRoleKeys ?? [])
            : (suite.coordinatorRoleKeys ?? suite.roles.map((entry) => entry.key))
    }
}

export function assertApplicationAssistantIdentity(
    assistant: IXpert,
    pluginName: string,
    templateKey: string,
    primaryAgentKey: string
) {
    const source = assistant.options?.templateSource ?? assistant.draft?.team?.options?.templateSource
    const primary = assistant.agent?.key ?? assistant.draft?.team?.agent?.key
    if (source?.pluginName !== pluginName || source.templateKey !== templateKey || primary !== primaryAgentKey) {
        throw new ConflictException('application_assistant_identity_mismatch')
    }
}

export function connectApplicationSuite(
    coordinator: IXpert,
    suite: PluginMarketplaceAppAssistantSuite,
    roles: Map<string, IXpert>,
    roleKey?: string
): TXpertTeamDraft {
    // Publication clears draft. Restore from the published instance, never from a
    // fresh template, so repair preserves model choices and existing configuration.
    const { graph, ...team } = omitXpertRelations(coordinator)
    const draft =
        coordinator.draft ??
        (coordinator.publishAt && graph ? { ...graph, team: { ...team, agent: coordinator.agent } } : null)
    if (!draft?.team || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)) {
        throw new ConflictException('application_coordinator_draft_missing')
    }
    const { primaryAgentKey, keys } = delegation(suite, roleKey)
    const nodes = [...draft.nodes],
        connections = draft.connections.map((c) => ({ ...c }))
    assertStandaloneAssistantsUnlinked(draft, suite, roles)
    assertDelegationScope(draft, suite, roles, keys)
    for (const [index, key] of keys.entries()) {
        const definition = suite.roles.find((entry) => entry.key === key)
        const role = roles.get(key)
        if (!role?.id) throw new ConflictException('application_role_missing')
        const aliases = nodes.filter(
            (n) => n.type === 'xpert' && n.entity.options?.templateSource?.templateKey === definition.templateKey
        )
        if (aliases.some((n) => n.key !== role.id)) throw new ConflictException('application_role_binding_ambiguous')
        const nodeIndex = nodes.findIndex((n) => n.type === 'xpert' && n.key === role.id)
        if (nodeIndex < 0) {
            nodes.push({ type: 'xpert', key: role.id, position: { x: 180 + index * 280, y: 400 }, entity: role })
        } else {
            // Refresh the embedded published role after repairing one of its dependencies.
            nodes[nodeIndex] = { ...nodes[nodeIndex], type: 'xpert', entity: role }
        }
        const existing = connections.filter((c) => c.type === 'xpert' && c.from === primaryAgentKey && c.to === role.id)
        if (existing.length > 1) throw new ConflictException('application_role_binding_ambiguous')
        if (existing[0]) existing[0].required = true
        else
            connections.push({
                key: `${primaryAgentKey}/${role.id}`,
                type: 'xpert',
                from: primaryAgentKey,
                to: role.id,
                required: true
            })
    }
    return { ...draft, nodes, connections }
}

export function verifyApplicationSuite(
    coordinator: IXpert,
    suite: PluginMarketplaceAppAssistantSuite,
    roles: Map<string, IXpert>
) {
    for (const definition of applicationSuiteAssistants(suite)) {
        const role = roles.get(definition.key)
        if (!role?.id || !role.latest || !role.publishAt) throw new ConflictException('application_role_unpublished')
        verifyDelegation(role, suite, roles, definition.key)
    }
    verifyDelegation(coordinator, suite, roles)
}

function verifyDelegation(
    coordinator: IXpert,
    suite: PluginMarketplaceAppAssistantSuite,
    roles: Map<string, IXpert>,
    roleKey?: string
) {
    const { primaryAgentKey, keys } = delegation(suite, roleKey)
    assertStandaloneAssistantsUnlinked(coordinator.graph, suite, roles)
    assertDelegationScope(coordinator.graph, suite, roles, keys)
    for (const key of keys) {
        const role = roles.get(key)
        if (!role) throw new ConflictException('application_role_missing')
        const nodes = coordinator.graph?.nodes?.filter((n) => n.type === 'xpert' && n.key === role.id) ?? []
        const connections =
            coordinator.graph?.connections?.filter(
                (c) => c.type === 'xpert' && c.from === primaryAgentKey && c.to === role.id && c.required === true
            ) ?? []
        if (nodes.length !== 1 || connections.length !== 1)
            throw new ConflictException('application_suite_binding_missing')
    }
}

function assertDelegationScope(
    graph: IXpert['graph'] | IXpert['draft'],
    suite: PluginMarketplaceAppAssistantSuite,
    roles: Map<string, IXpert>,
    allowed: string[]
) {
    for (const definition of suite.roles.filter((role) => !allowed.includes(role.key))) {
        const role = roles.get(definition.key)
        if (!role) continue
        const nodes =
            graph?.nodes?.filter(
                (node) =>
                    node.type === 'xpert' &&
                    (node.key === role.id ||
                        (node.entity.options?.templateSource?.pluginName === role.options?.templateSource?.pluginName &&
                            node.entity.options?.templateSource?.templateKey === definition.templateKey))
            ) ?? []
        if (nodes.length || graph?.connections?.some((edge) => edge.to === role.id || edge.from === role.id)) {
            throw new ConflictException({
                code: 'application_suite_undeclared_delegation',
                message: t('server-ai:Error.ApplicationSuiteUndeclaredDelegation', {
                    defaultValue:
                        'An Assistant has a delegation link outside the application suite definition. Review the existing link before repairing the application.'
                })
            })
        }
    }
}

function assertStandaloneAssistantsUnlinked(
    graph: IXpert['graph'] | IXpert['draft'],
    suite: PluginMarketplaceAppAssistantSuite,
    assistants: Map<string, IXpert>
) {
    for (const definition of suite.standaloneAssistants ?? []) {
        const assistant = assistants.get(definition.key)
        if (!assistant?.id) throw new ConflictException('application_role_missing')
        const source = assistant.options?.templateSource ?? assistant.draft?.team?.options?.templateSource
        const nodes =
            graph?.nodes?.filter(
                (node) =>
                    node.type === 'xpert' &&
                    (node.key === assistant.id ||
                        node.entity.id === assistant.id ||
                        (source?.pluginName &&
                            node.entity.options?.templateSource?.pluginName === source.pluginName &&
                            node.entity.options.templateSource.templateKey === definition.templateKey))
            ) ?? []
        if (
            nodes.length ||
            graph?.connections?.some((connection) => connection.to === assistant.id || connection.from === assistant.id)
        ) {
            throw new ConflictException({
                code: 'application_standalone_assistant_connected',
                message: t('server-ai:Error.ApplicationStandaloneAssistantConnected', {
                    defaultValue:
                        'A standalone Assistant is linked to the coordinator. Remove its delegation before repairing this application.'
                })
            })
        }
    }
}
