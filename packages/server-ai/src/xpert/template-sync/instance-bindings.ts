// Invariants: templates own instructions; installed instances own model selections and resource IDs.
// Match resources by explicit provider/component identity, never by a display name.
// An ambiguous or missing binding must fail before any draft is saved.
import {
    IWFNMiddleware,
    IXpert,
    IXpertAgent,
    IXpertToolset,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { get, set, unset } from 'lodash'
import { MiddlewareModelTargetCatalog } from '../copilot-model-sync.util'

export function preserveTemplateInstanceBindings(
    incoming: TXpertTeamDraft,
    installed: IXpert,
    modelTargets: MiddlewareModelTargetCatalog
): void {
    const current = installed.draft ?? { team: installed, ...installed.graph }
    const team = current.team ?? installed
    incoming.team.copilotModel = structuredClone(team.copilotModel ?? null)
    incoming.team.copilotModelId = team.copilotModel?.id ?? null
    incoming.team.environmentId = installed.environmentId ?? null
    incoming.team.options = {
        ...incoming.team.options,
        modelSelection: structuredClone(team.options?.modelSelection)
    }
    for (const path of [
        'memory.copilotModel',
        'features.textToSpeech.copilotModel',
        'features.speechToText.copilotModel'
    ]) {
        const value = get(team, path)
        if (value !== undefined) set(incoming.team, path, structuredClone(value))
        else unset(incoming.team, path)
    }
    const oldAgents = new Map<string, IXpertAgent>()
    for (const agent of [installed.agent, ...(installed.agents ?? [])]) {
        if (agent) oldAgents.set(agent.key, agent)
    }
    for (const node of current.nodes ?? []) {
        if (node.type === 'agent') oldAgents.set(node.key, node.entity)
    }
    for (const node of incoming.nodes ?? []) {
        if (node.type === 'agent') {
            const old = oldAgents.get(node.key)
            if (old) {
                node.entity.copilotModel = structuredClone(old.copilotModel ?? null)
                node.entity.copilotModelId = old.copilotModel?.id ?? null
                node.entity = { ...node.entity, updatedAt: old.updatedAt }
            }
        } else if (node.type === 'workflow') {
            const old = current.nodes?.find((item) => item.key === node.key && item.type === 'workflow')
            if (old?.type !== 'workflow' || old.entity.type !== node.entity.type) continue
            if ('copilotModel' in old.entity) {
                Object.assign(node.entity, { copilotModel: structuredClone(old.entity.copilotModel ?? null) })
            }
            if (node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE) {
                const next = node.entity as IWFNMiddleware
                const prior = old.entity as IWFNMiddleware
                if (next.provider !== prior.provider) continue
                for (const target of modelTargets[next.provider] ?? []) {
                    const path = `options.${target.path}`
                    const value = get(prior, path)
                    if (value === undefined) unset(next, path)
                    else set(next, path, structuredClone(value))
                }
            }
        }
    }
    const primary = incoming.nodes?.find((node) => node.type === 'agent' && node.key === incoming.team.agent?.key)
    if (primary?.type === 'agent') incoming.team.agent = primary.entity

    const oldTools = (current.nodes ?? []).filter((node) => node.type === 'toolset')
    const remap = new Map<string, string>()
    incoming.nodes = (incoming.nodes ?? []).map((node) => {
        if (node.type !== 'toolset') return node
        const exact = oldTools.filter(
            (old) => old.key === node.key || (!!node.entity.id && old.entity.id === node.entity.id)
        )
        const candidates = exact.length ? exact : oldTools.filter((old) => sameToolProvider(old.entity, node.entity))
        if (candidates.length !== 1 || !candidates[0].entity.id) {
            throw new BadRequestException(
                t('server-ai:Error.TemplateToolBindingRequired', {
                    defaultValue: 'Bind the template tool to exactly one installed toolset before synchronizing.',
                    key: node.key
                })
            )
        }
        const old = candidates[0]
        remap.set(node.key, old.entity.id)
        if (node.entity.id) remap.set(node.entity.id, old.entity.id)
        return { ...node, key: old.entity.id, entity: structuredClone(old.entity) }
    })
    incoming.connections = (incoming.connections ?? []).map((edge) => ({
        ...edge,
        ...(remap.has(edge.to) ? { to: remap.get(edge.to), key: `${edge.from}/${remap.get(edge.to)}` } : {})
    }))

    // Retain locally attached tools/knowledge only for Agents still present in the new graph.
    const agents = new Set(incoming.nodes.filter((node) => node.type === 'agent').map((node) => node.key))
    for (const edge of current.connections ?? []) {
        if (!['toolset', 'knowledge'].includes(edge.type) || !agents.has(edge.from)) continue
        const resource = current.nodes?.find((node) => node.key === edge.to && node.type === edge.type)
        if (!resource) continue
        if (!incoming.nodes.some((node) => node.key === resource.key)) incoming.nodes.push(structuredClone(resource))
        if (
            !incoming.connections.some(
                (next) => next.type === edge.type && next.from === edge.from && next.to === edge.to
            )
        ) {
            incoming.connections.push(structuredClone(edge))
        }
    }
    for (const node of incoming.nodes) {
        if (node.type !== 'agent') continue
        node.entity.toolsetIds = resourceIds(incoming, node.key, 'toolset')
        node.entity.knowledgebaseIds = resourceIds(incoming, node.key, 'knowledge')
    }
    incoming.team.toolsets = incoming.nodes.flatMap((node) => (node.type === 'toolset' ? [node.entity] : []))
    incoming.team.knowledgebases = incoming.nodes.flatMap((node) => (node.type === 'knowledge' ? [node.entity] : []))
}

function resourceIds(draft: TXpertTeamDraft, agent: string, type: TXpertTeamNode['type']) {
    return [
        ...new Set(draft.connections.filter((edge) => edge.type === type && edge.from === agent).map((edge) => edge.to))
    ]
}

function sameToolProvider(left: IXpertToolset, right: IXpertToolset): boolean {
    if (left.category !== right.category) return false
    const source = right.options
    if (source?.pluginName && source.componentKey) {
        return left.options?.pluginName === source.pluginName && left.options?.componentKey === source.componentKey
    }
    if (right.key) return left.key === right.key
    return right.category === XpertToolsetCategoryEnum.BUILTIN && !!right.type && left.type === right.type
}
