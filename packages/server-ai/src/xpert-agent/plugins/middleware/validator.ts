import {
    ChecklistItem,
    IWFNMiddleware,
    normalizeMiddlewareProvider,
    TAgentMiddlewareMeta,
    TXpertFeatureKey,
    TXpertFeatures,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'
import { SKILLS_MIDDLEWARE_NAME } from '../../../skill-package/types'

const MULTIPLE_SKILLS_MIDDLEWARE_CONNECTED = 'MULTIPLE_SKILLS_MIDDLEWARE_CONNECTED'

function isXpertFeatureEnabled(xpertFeatures: TXpertFeatures | null | undefined, feature: TXpertFeatureKey) {
    return xpertFeatures?.[feature]?.enabled === true
}

const normalizeConnectionNodeKey = (key?: string | null) => key?.split('/')?.[0] ?? ''

function isSkillsMiddlewareNode(node: TXpertTeamNode) {
    const entity = node.entity as IWFNMiddleware
    return normalizeMiddlewareProvider(entity.provider) === SKILLS_MIDDLEWARE_NAME
}

function getMultipleSkillsMiddlewareConnectedMessage(nodeKey: string) {
    return {
        en_US: `Node "${nodeKey}" can connect to only one Skills Middleware node`,
        zh_Hans: `节点 "${nodeKey}" 只能连接一个技能中间件`
    }
}

@Injectable()
export class WorkflowMiddlewareNodeValidator {
    constructor(private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry) {}

    @OnEvent(EventNameXpertValidate)
    handle(event: XpertDraftValidateEvent) {
        const draft = event.draft
        const middlewareNodes = draft.nodes.filter(
            (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
        )
        const items: ChecklistItem[] = []
        middlewareNodes.forEach((node) => {
            items.push(...this.check(node, draft.team.features))
        })
        items.push(...this.checkMultipleSkillsMiddlewareConnections(draft, middlewareNodes))
        return items
    }

    private checkMultipleSkillsMiddlewareConnections(
        draft: XpertDraftValidateEvent['draft'],
        middlewareNodes: TXpertTeamNode[]
    ) {
        const middlewareByKey = new Map(middlewareNodes.map((node) => [node.key, node]))
        const middlewaresBySource = new Map<string, TXpertTeamNode[]>()

        for (const connection of draft.connections ?? []) {
            if (connection.type !== 'workflow') {
                continue
            }

            const sourceKey = normalizeConnectionNodeKey(connection.from)
            const targetKey = normalizeConnectionNodeKey(connection.to)
            const targetNode = middlewareByKey.get(targetKey)
            if (!sourceKey || !targetNode) {
                continue
            }

            const sourceMiddlewares = middlewaresBySource.get(sourceKey) ?? []
            sourceMiddlewares.push(targetNode)
            middlewaresBySource.set(sourceKey, sourceMiddlewares)
        }

        return Array.from(middlewaresBySource.entries()).flatMap(([sourceKey, sourceMiddlewares]) =>
            sourceMiddlewares
                .filter(isSkillsMiddlewareNode)
                .slice(1)
                .map((node) => ({
                    node: node.key,
                    ruleCode: MULTIPLE_SKILLS_MIDDLEWARE_CONNECTED,
                    field: 'connections',
                    value: sourceKey,
                    message: getMultipleSkillsMiddlewareConnectedMessage(sourceKey),
                    level: 'error' as const
                }))
        )
    }

    check(node: TXpertTeamNode, xpertFeatures?: TXpertFeatures | null) {
        const entity = node.entity as IWFNMiddleware
        const provider = normalizeMiddlewareProvider(entity.provider)
        let meta: TAgentMiddlewareMeta

        try {
            meta = this.agentMiddlewareRegistry.get(provider).meta
        } catch {
            return [
                {
                    node: node.key,
                    ruleCode: 'MIDDLEWARE_PROVIDER_NOT_FOUND',
                    field: 'provider',
                    value: provider,
                    message: {
                        en_US: `Middleware provider "${provider}" not found`,
                        zh_Hans: `中间件提供者 "${provider}" 未找到`
                    },
                    level: 'error' as const
                }
            ]
        }

        const requiredFeatures = Array.from(new Set(meta.features ?? []))
        if (requiredFeatures.length === 0) {
            return []
        }

        const labelEn = meta.label.en_US ?? provider
        const labelZh = meta.label.zh_Hans ?? labelEn

        return requiredFeatures
            .filter((feature) => !isXpertFeatureEnabled(xpertFeatures, feature))
            .map((feature) => ({
                node: node.key,
                ruleCode: 'MIDDLEWARE_REQUIRED_FEATURE_DISABLED',
                field: 'provider',
                value: feature,
                message: {
                    en_US: `Middleware "${labelEn}" requires the xpert "${feature}" feature to be enabled`,
                    zh_Hans: `中间件 "${labelZh}" 需要先开启 xpert 的 "${feature}" 功能`
                },
                level: 'error' as const
            }))
    }
}
