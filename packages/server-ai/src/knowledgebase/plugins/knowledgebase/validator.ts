import { ChecklistItem, IWFNKnowledgeBase, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { QueryBus } from '@nestjs/cqrs'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'
import { CopilotGetOneQuery } from '../../../copilot'

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
		for await (const node of codeNodes) {
			items.push(...(await this.check(node)))
		}
		return items
	}

	async check(node: TXpertTeamNode) {
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

		// Embedding model must be specified
		if (!entity.copilotModel) {
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
		} else if (!entity.copilotModel.copilotId) {
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

		if (entity.copilotModel?.copilotId) {
			const copilot = this.queryBus.execute(
					new CopilotGetOneQuery(RequestContext.currentTenantId(), entity.copilotModel.copilotId)
				)
			if (!copilot) {
				items.push({
					ruleCode: 'PIPELINE_KB_EMBEDDING_MODEL_PROVIDER_NOT_FOUND',
					node: node.key,
					field: 'copilotModel.copilotId',
					value: entity.copilotModel.copilotId,
					level: 'error',
					message: {
						en_US: `Embedding model provider not found.`,
						zh_Hans: `未找到嵌入模型的提供商。`
					}
				})
			}
		}

		if (entity.rerankModel && !entity.rerankModel.copilotId) {
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

		return items
	}
}
