import { ChecklistItem, IKnowledgebase, IWFNKnowledgeBase, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { QueryBus } from '@nestjs/cqrs'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'
import { CopilotGetOneQuery } from '../../../copilot'
import { KnowledgebaseGetOneQuery } from '../../queries'

@Injectable()
export class WorkflowKnowledgeBaseNodeValidator {
    @Inject(QueryBus)
    private readonly queryBus: QueryBus

    @OnEvent(EventNameXpertValidate)
    async handle(event: XpertDraftValidateEvent) {
        const draft = event.draft
        const codeNodes = draft.nodes.filter(
            (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE
        )
        const items: ChecklistItem[] = []
        let knowledgebase = draft.team?.knowledgebase
        if (knowledgebase?.id) {
            try {
                knowledgebase = await this.queryBus.execute(
                    new KnowledgebaseGetOneQuery({
                        id: knowledgebase.id,
                        options: { relations: ['copilotModel', 'rerankModel', 'chatModel', 'visionModel'] }
                    })
                )
            } catch (error) {
                const message = getErrorMessage(error) || 'Unknown error'
                return codeNodes.map((node) => ({
                    ruleCode: 'PIPELINE_KB_CONFIG_LOAD_FAILED',
                    node: node.key,
                    field: 'knowledgebase.id',
                    value: knowledgebase.id,
                    level: 'error',
                    message: {
                        en_US: `Failed to load knowledgebase configuration: ${message}`,
                        zh_Hans: `读取知识库配置失败：${message}`
                    }
                }))
            }
        }
        for await (const node of codeNodes) {
            items.push(...(await this.check(node, knowledgebase)))
        }
        return items
    }

    async check(node: TXpertTeamNode, knowledgebase?: Partial<IKnowledgebase> | null) {
        const entity = node.entity as IWFNKnowledgeBase
        const items: ChecklistItem[] = []

        entity.inputs?.forEach((input, index) => {
            if (!input) {
                items.push({
                    ruleCode: 'PIPELINE_KB_INPUT_EMPTY',
                    node: node.key,
                    field: 'inputs',
                    value: input,
                    level: 'error',
                    message: {
                        en_US: `Input at index ${index} is empty.`,
                        zh_Hans: `索引 ${index} 处的输入为空。`
                    }
                })
            }
        })

        // inputs should not have duplicates
        const duplicates = entity.inputs?.filter((item, index) => entity.inputs?.indexOf(item) !== index)
        if (duplicates?.length) {
            items.push({
                ruleCode: 'PIPELINE_KB_INPUT_DUPLICATE',
                node: node.key,
                field: 'inputs',
                value: duplicates.join(','),
                level: 'error',
                message: {
                    en_US: `Input has duplicates: ${[...new Set(duplicates)].join(', ')}.`,
                    zh_Hans: `输入有重复项：${[...new Set(duplicates)].join('，')}。`
                }
            })
        }

        if (!entity.inputs || entity.inputs.length === 0) {
            items.push({
                ruleCode: 'PIPELINE_KB_INPUT_MISSING',
                node: node.key,
                field: 'inputs',
                value: JSON.stringify(entity.inputs),
                level: 'error',
                message: {
                    en_US: `At least one input is required.`,
                    zh_Hans: `至少需要一个输入。`
                }
            })
        }

        if (!knowledgebase?.copilotModel && !knowledgebase?.copilotModelId) {
            items.push({
                ruleCode: 'PIPELINE_KB_EMBEDDING_MODEL_MISSING',
                node: node.key,
                field: 'copilotModel',
                value: '',
                level: 'error',
                message: {
                    en_US: `Embedding model must be specified.`,
                    zh_Hans: `必须指定嵌入模型。`
                }
            })
        } else if (knowledgebase.copilotModel && !knowledgebase.copilotModel.copilotId) {
            items.push({
                ruleCode: 'PIPELINE_KB_EMBEDDING_MODEL_PROVIDER_MISSING',
                node: node.key,
                field: 'copilotModel.copilotId',
                value: '',
                level: 'error',
                message: {
                    en_US: `Embedding model provider must be specified.`,
                    zh_Hans: `必须指定嵌入模型的提供商。`
                }
            })
        }

        if (knowledgebase?.copilotModel?.copilotId) {
            const copilot = await this.queryBus.execute(
                new CopilotGetOneQuery(RequestContext.currentTenantId(), knowledgebase.copilotModel.copilotId)
            )
            if (!copilot) {
                items.push({
                    ruleCode: 'PIPELINE_KB_EMBEDDING_MODEL_PROVIDER_NOT_FOUND',
                    node: node.key,
                    field: 'copilotModel.copilotId',
                    value: knowledgebase.copilotModel.copilotId,
                    level: 'error',
                    message: {
                        en_US: `Embedding model provider not found.`,
                        zh_Hans: `未找到嵌入模型的提供商。`
                    }
                })
            }
        }

        if (knowledgebase?.rerankModel && !knowledgebase.rerankModel.copilotId) {
            items.push({
                ruleCode: 'PIPELINE_KB_RERANK_MODEL_PROVIDER_MISSING',
                node: node.key,
                field: 'rerankModel.copilotId',
                value: '',
                level: 'error',
                message: {
                    en_US: `Rerank model provider must be specified.`,
                    zh_Hans: `必须指定重排序模型的提供商。`
                }
            })
        }

        if (knowledgebase?.chatModel && !knowledgebase.chatModel.copilotId) {
            items.push({
                ruleCode: 'PIPELINE_KB_CHAT_MODEL_PROVIDER_MISSING',
                node: node.key,
                field: 'chatModel.copilotId',
                value: '',
                level: 'error',
                message: {
                    en_US: `Chat model provider must be specified.`,
                    zh_Hans: `必须指定对话模型的提供商。`
                }
            })
        }

        if (knowledgebase?.visionModel && !knowledgebase.visionModel.copilotId) {
            items.push({
                ruleCode: 'PIPELINE_KB_VISION_MODEL_PROVIDER_MISSING',
                node: node.key,
                field: 'visionModel.copilotId',
                value: '',
                level: 'error',
                message: {
                    en_US: `Vision model provider must be specified.`,
                    zh_Hans: `必须指定视觉模型的提供商。`
                }
            })
        }

        return items
    }
}
