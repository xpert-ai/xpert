import { IWFNMiddleware, TemplateUpgradeInput, TXpertTeamDraft, SKILLS_MIDDLEWARE_NAME } from '@xpert-ai/contracts'
import { portableDraft, PortableTemplate } from '../../xpert-template/lifecycle/portable-template'

/** Keeps local identity/models/bindings. Imported runtime nodes contain only portable adapter fields. */
export function mergeTemplateUpgrade(
    current: TXpertTeamDraft,
    incoming: PortableTemplate,
    input: TemplateUpgradeInput
): TXpertTeamDraft {
    const draft = structuredClone(current)
    const source = portableDraft(incoming)
    if (input.choices.presentation === 'replace') Object.assign(draft.team, incoming.presentation)
    if (input.choices.instructions === 'replace') {
        const primary = draft.team.agent?.key
        const keyFor = (key: string) => (key === incoming.instructions.primary ? primary : key)
        const importedAgents = source.nodes.filter((node) => node.type === 'agent')
        draft.nodes = [
            ...draft.nodes.filter((node) => node.type !== 'agent'),
            ...importedAgents.map((node) => {
                const key = keyFor(node.key)
                const old = current.nodes.find((item) => item.type === 'agent' && item.key === key)
                return {
                    ...node,
                    key,
                    position: old?.position ?? node.position,
                    entity: { ...(old?.type === 'agent' ? old.entity : {}), ...node.entity, key }
                }
            })
        ]
    }
    if (input.choices.runtime === 'replace') {
        const primary = draft.team.agent?.key
        const keyFor = (key: string) => (key === incoming.instructions.primary ? primary : key)
        // Installed skill references are generated from the declarative dependencies, never portable IDs.
        const skills = current.nodes.filter(
            (node) =>
                node.type === 'workflow' &&
                node.entity.type === 'middleware' &&
                (node.entity as IWFNMiddleware).provider === SKILLS_MIDDLEWARE_NAME
        )
        const skillKeys = new Set(skills.map((node) => node.key))
        const runtime = source.nodes
            .filter((node) => node.type !== 'agent')
            .map((node) => {
                if (node.type !== 'workflow' || node.entity.type !== 'middleware') return node
                const incomingMiddleware = node.entity as IWFNMiddleware
                const previous = current.nodes.find((item) => item.key === node.key && item.type === 'workflow')
                if (
                    incomingMiddleware.provider !== 'ConnectorMiddleware' ||
                    previous?.type !== 'workflow' ||
                    previous.entity.type !== 'middleware'
                )
                    return node
                const old = previous.entity as IWFNMiddleware
                if (
                    old.provider !== incomingMiddleware.provider ||
                    old.options?.provider !== incomingMiddleware.options?.provider
                )
                    return node
                return {
                    ...node,
                    entity: {
                        ...incomingMiddleware,
                        options: { ...incomingMiddleware.options, connectorId: old.options?.connectorId }
                    }
                }
            })
        draft.nodes = [...draft.nodes.filter((node) => node.type === 'agent'), ...runtime, ...skills]
        draft.connections = [
            ...source.connections.map((edge) => ({ ...edge, from: keyFor(edge.from), to: keyFor(edge.to) })),
            ...current.connections.filter((edge) => skillKeys.has(edge.to))
        ]
        draft.team.features = {
            ...draft.team.features,
            sandbox: { ...draft.team.features?.sandbox, enabled: incoming.runtime.sandbox }
        }
    }
    if (input.choices.definition === 'replace') {
        draft.team.options = {
            ...draft.team.options,
            templateDefinition: source.template,
            operationPolicy: incoming.definition.policy
        }
    }
    return draft
}
