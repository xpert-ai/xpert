import type { IXpert, PluginMarketplaceAppAssistantSuite, TXpertTeamDraft } from '@xpert-ai/contracts'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { t } from 'i18next'

// Invariant: provisioning an Assistant does not grant coordinator delegation.
// Standalone Assistants are published and checked, but must stay out of its graph.
export function applicationSuiteAssistants(suite: PluginMarketplaceAppAssistantSuite) {
    return [...suite.roles, ...(suite.standaloneAssistants ?? [])]
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
    roles: Map<string, IXpert>
): TXpertTeamDraft {
    const draft = coordinator.draft
    if (!draft?.team || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)) {
        throw new ConflictException('application_coordinator_draft_missing')
    }
    const nodes = [...draft.nodes],
        connections = draft.connections.map((c) => ({ ...c }))
    assertStandaloneAssistantsUnlinked(draft, suite, roles)
    for (const [index, definition] of suite.roles.entries()) {
        const role = roles.get(definition.key)
        if (!role?.id) throw new ConflictException('application_role_missing')
        const aliases = nodes.filter(
            (n) => n.type === 'xpert' && n.entity.options?.templateSource?.templateKey === definition.templateKey
        )
        if (aliases.some((n) => n.key !== role.id)) throw new ConflictException('application_role_binding_ambiguous')
        if (!nodes.some((n) => n.type === 'xpert' && n.key === role.id)) {
            nodes.push({ type: 'xpert', key: role.id, position: { x: 180 + index * 280, y: 400 }, entity: role })
        }
        const existing = connections.filter(
            (c) => c.type === 'xpert' && c.from === suite.coordinatorAgentKey && c.to === role.id
        )
        if (existing.length > 1) throw new ConflictException('application_role_binding_ambiguous')
        if (existing[0]) existing[0].required = true
        else
            connections.push({
                key: `${suite.coordinatorAgentKey}/${role.id}`,
                type: 'xpert',
                from: suite.coordinatorAgentKey,
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
    }
    assertStandaloneAssistantsUnlinked(coordinator.graph, suite, roles)
    for (const definition of suite.roles) {
        const role = roles.get(definition.key)
        const nodes = coordinator.graph?.nodes?.filter((n) => n.type === 'xpert' && n.key === role.id) ?? []
        const connections =
            coordinator.graph?.connections?.filter(
                (c) =>
                    c.type === 'xpert' &&
                    c.from === suite.coordinatorAgentKey &&
                    c.to === role.id &&
                    c.required === true
            ) ?? []
        if (nodes.length !== 1 || connections.length !== 1)
            throw new ConflictException('application_suite_binding_missing')
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
