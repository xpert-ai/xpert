import { ChecklistItem, IWFNUnderstanding, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { OnEvent } from '@nestjs/event-emitter'
import { CopilotGetOneQuery } from '../../../copilot'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowUnderstandingNodeValidator {
	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	@OnEvent(EventNameXpertValidate)
	async handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.UNDERSTANDING
		)

		const items: ChecklistItem[] = []
		for await (const node of codeNodes) {
			items.push(...(await this.check(node)))
		}
		return items
	}

	async check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNUnderstanding
		const items: ChecklistItem[] = []

		if (entity.visionModel && !entity.visionModel.copilotId) {
			items.push({
				node: node.key,
				field: 'visionModel',
				message: {
					en_US: `Vision model is required`,
					zh_Hans: `视觉模型是必需的`
				},
				level: 'error',
				ruleCode: 'KNOWLEDGEBASE_UNDERSTANDING_VISION_MODEL_REQUIRED'
			})
		}

		if (entity.visionModel?.copilotId) {
			const copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(RequestContext.currentTenantId(), entity.visionModel.copilotId)
			)
			if (!copilot) {
				items.push({
					node: node.key,
					field: 'visionModel.copilotId',
					value: entity.visionModel.copilotId,
					message: {
						en_US: `Vision model provider not found`,
						zh_Hans: `未找到视觉模型的提供商`
					},
					level: 'error',
					ruleCode: 'KNOWLEDGEBASE_UNDERSTANDING_VISION_MODEL_PROVIDER_NOT_FOUND'
				})
			}
		}

		return items
	}
}
