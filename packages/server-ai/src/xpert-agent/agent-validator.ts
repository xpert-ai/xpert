import { AiModelTypeEnum, AiProviderRole, ChecklistItem, ICopilot, TXpertTeamNode } from '@xpert-ai/contracts'
import { Injectable, Optional } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { OnEvent } from '@nestjs/event-emitter'
import { RequestContext } from '@xpert-ai/server-core'
import { CopilotOneByRoleQuery } from '../copilot'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../xpert/types'

@Injectable()
export class XpertAgentNodeValidator {
    constructor(@Optional() private readonly queryBus?: QueryBus) {}

    @OnEvent(EventNameXpertValidate)
    async handle(event: XpertDraftValidateEvent) {
        const items: ChecklistItem[] = []
        const embeddingCopilotAvailable = await this.isEmbeddingCopilotAvailable()
        event.draft.nodes
            .filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
            .forEach((node) => {
                items.push(...this.check(node, embeddingCopilotAvailable))
            })
        return items
    }

    check(node: TXpertTeamNode<'agent'>, embeddingCopilotAvailable = true) {
        const agent = node.entity
        const items: ChecklistItem[] = []
        if (agent.options?.structuredOutputMethod && agent.options.fileUnderstanding?.enabled !== false) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_STRUCTURED_OUTPUT_FILE_UNDERSTANDING_CONFLICT',
                field: 'options.fileUnderstanding.enabled',
                value: String(agent.options.fileUnderstanding?.enabled ?? true),
                message: {
                    en_US: 'File understanding cannot be used together with structured output. The built-in file understanding tools will be skipped while structured output is enabled.',
                    zh_Hans: '文件理解不能与结构化输出同时使用。启用结构化输出时，内置文件理解工具会被跳过。'
                },
                level: 'warning'
            })
        }
        if (agent.options?.fileUnderstanding?.enabled !== false && !embeddingCopilotAvailable) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_FILE_UNDERSTANDING_EMBEDDING_UNAVAILABLE',
                field: 'options.fileUnderstanding.enabled',
                value: String(agent.options.fileUnderstanding?.enabled ?? true),
                message: {
                    en_US: 'File understanding is enabled, but no available Embedding model is configured for the current tenant or organization. Configure an enabled Embedding Copilot with a Text Embedding model before relying on file vector search.',
                    zh_Hans:
                        '文件理解已开启，但当前租户或组织未配置可用的嵌入模型。请在模型提供商设置中启用嵌入角色并选择默认嵌入模型后，再使用文件向量检索。'
                },
                level: 'warning'
            })
        }
        return items
    }

    private async isEmbeddingCopilotAvailable() {
        if (!this.queryBus) {
            return true
        }
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            return false
        }
        try {
            const copilot = await this.queryBus.execute<CopilotOneByRoleQuery, ICopilot | null>(
                new CopilotOneByRoleQuery(tenantId, RequestContext.getOrganizationId(), AiProviderRole.Embedding, [
                    'copilotModel',
                    'modelProvider'
                ])
            )
            return isEmbeddingCopilotAvailable(copilot)
        } catch {
            return false
        }
    }
}

function isEmbeddingCopilotAvailable(copilot: ICopilot | null | undefined) {
    return (
        copilot?.enabled === true &&
        !!copilot.modelProvider &&
        copilot.modelProvider.isValid !== false &&
        copilot.copilotModel?.modelType === AiModelTypeEnum.TEXT_EMBEDDING &&
        !!copilot.copilotModel.model
    )
}
