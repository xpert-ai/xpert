import { BadRequestException } from '@nestjs/common'
import {
    genXpertMiddlewareKey,
    IWFNMiddleware,
    IXpert,
    IXpertAgent,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { SKILLS_MIDDLEWARE_NAME } from '../../skill-package/types'
import { PLUGIN_HOOKS_MIDDLEWARE_NAME } from '../hooks/plugin-hooks.middleware'
import type { RuntimeComponent } from './plugin-resource-installer.types'
import { isHookRef, isObjectValue } from './plugin-resource-installer.utils'

export function ensureSkillsMiddlewareNode(draft: TXpertTeamDraft, agentKey: string, skillPackageId: string) {
    const node = findMiddlewareNode(draft, agentKey, SKILLS_MIDDLEWARE_NAME)
    const target = node ?? createMiddlewareNode(draft, agentKey, SKILLS_MIDDLEWARE_NAME, 'Skills Middleware', -280)
    const entity = target.entity as IWFNMiddleware
    const options = isObjectValue(entity.options) ? entity.options : {}
    const configuredSkills = Array.isArray(Reflect.get(options, 'skills'))
        ? (Reflect.get(options, 'skills') as unknown[]).filter((item): item is string => typeof item === 'string')
        : []
    const nextSkills = configuredSkills.includes(skillPackageId)
        ? configuredSkills
        : [...configuredSkills, skillPackageId]
    entity.options = {
        ...options,
        skills: nextSkills
    }
    return target.key
}

export function ensurePluginHooksMiddlewareNode(
    draft: TXpertTeamDraft,
    agentKey: string,
    runtimeComponent: RuntimeComponent
) {
    const node =
        findMiddlewareNode(draft, agentKey, PLUGIN_HOOKS_MIDDLEWARE_NAME) ??
        createMiddlewareNode(draft, agentKey, PLUGIN_HOOKS_MIDDLEWARE_NAME, 'Plugin Hooks', -120)
    const entity = node.entity as IWFNMiddleware
    const options = isObjectValue(entity.options) ? entity.options : {}
    const hooks = Array.isArray(Reflect.get(options, 'hooks'))
        ? (Reflect.get(options, 'hooks') as unknown[]).filter(isHookRef)
        : []
    const nextHook = {
        pluginName: runtimeComponent.pluginName,
        componentKey: runtimeComponent.component.componentKey,
        events: runtimeComponent.events ?? []
    }
    const exists = hooks.some(
        (hook) => hook.pluginName === nextHook.pluginName && hook.componentKey === nextHook.componentKey
    )
    entity.options = {
        ...options,
        hooks: exists ? hooks : [...hooks, nextHook]
    }
    return node.key
}

export function ensureToolsetNode(
    draft: TXpertTeamDraft,
    agentKey: string,
    toolsetId: string,
    runtimeComponent: RuntimeComponent
) {
    const nodeExists = draft.nodes.some((node) => node.type === 'toolset' && node.key === toolsetId)
    if (!nodeExists) {
        draft.nodes.push({
            key: toolsetId,
            type: 'toolset',
            position: { x: 280, y: 260 },
            entity: {
                id: toolsetId,
                name: `${runtimeComponent.component.componentKey} MCP`,
                type: runtimeComponent.component.componentKey,
                category: XpertToolsetCategoryEnum.MCP
            }
        })
    }

    ensureConnection(draft, agentKey, toolsetId, 'toolset')
    const agent = findAgentInDraft(draft, agentKey)
    if (agent) {
        const toolsetIds = agent.toolsetIds ?? []
        agent.toolsetIds = toolsetIds.includes(toolsetId) ? toolsetIds : [...toolsetIds, toolsetId]
    }
}

export function createMiddlewareNode(
    draft: TXpertTeamDraft,
    agentKey: string,
    provider: string,
    title: string,
    xOffset: number,
    key = genXpertMiddlewareKey()
) {
    const entity: IWFNMiddleware = {
        id: key,
        key,
        title,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider,
        options: {}
    }
    const node: TXpertTeamNode<'workflow'> = {
        key,
        type: 'workflow',
        position: { x: xOffset, y: 260 },
        entity
    }
    draft.nodes.push(node)
    ensureConnection(draft, agentKey, key, 'workflow')
    return node
}

export function findMiddlewareNode(draft: TXpertTeamDraft, agentKey: string, provider: string) {
    const connectedKeys = new Set(
        draft.connections
            .filter((connection) => connection.from === agentKey && connection.type === 'workflow')
            .map((item) => item.to)
    )
    return draft.nodes.find((node) => {
        if (node.type !== 'workflow' || !connectedKeys.has(node.key)) {
            return false
        }
        const entity = node.entity as IWFNMiddleware
        return entity.type === WorkflowNodeTypeEnum.MIDDLEWARE && entity.provider === provider
    }) as TXpertTeamNode<'workflow'> | undefined
}

export function ensureConnection(draft: TXpertTeamDraft, from: string, to: string, type: TXpertTeamConnection['type']) {
    const key = `${from}/${to}`
    if (
        draft.connections.some(
            (connection) => connection.key === key || (connection.from === from && connection.to === to)
        )
    ) {
        return
    }
    draft.connections.push({
        key,
        from,
        to,
        type
    })
}

export function ensureDraft(xpert: IXpert): TXpertTeamDraft {
    const draft = xpert.draft
    if (!draft?.team) {
        throw new BadRequestException('Xpert draft is required before installing plugin resources')
    }
    return {
        ...draft,
        team: {
            ...draft.team,
            id: draft.team.id ?? xpert.id,
            workspaceId: draft.team.workspaceId ?? xpert.workspaceId
        },
        nodes: [...(draft.nodes ?? [])],
        connections: [...(draft.connections ?? [])]
    }
}

export function getPrimaryAgentKey(xpert: IXpert, draft: TXpertTeamDraft) {
    const key = draft.team.agent?.key ?? xpert.agent?.key
    if (key) {
        return key
    }
    const agentNode = draft.nodes.find((node) => node.type === 'agent')
    if (agentNode?.type === 'agent') {
        return agentNode.key
    }
    throw new BadRequestException('Primary agent key is required')
}

export function findAgentInDraft(draft: TXpertTeamDraft, agentKey: string): IXpertAgent | null {
    const node = draft.nodes.find((item) => item.type === 'agent' && item.key === agentKey)
    if (node?.type === 'agent') {
        return node.entity
    }
    if (draft.team.agent?.key === agentKey) {
        return draft.team.agent
    }
    return null
}
