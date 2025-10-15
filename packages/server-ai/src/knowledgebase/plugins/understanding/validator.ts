import { ChecklistItem, IWFNUnderstanding, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowUnderstandingNodeValidator {
	
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.UNDERSTANDING
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
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

		return items
	}
}
