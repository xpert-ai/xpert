import { ChecklistItem, IWFNSource, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowSourceNodeValidator {

	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.SOURCE
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNSource
		const items: ChecklistItem[] = []

		// items.push({
		// 	node: node.key,
		// 	ruleCode: 'SOURCE_INTEGRATION_REQUIRED',
		// 	field: 'integration',
		// 	value: entity.integrationId,
		// 	message: {
		// 		en_US: `Integration for Source node "${entity.title || node.key}" is not defined`,
		// 		zh_Hans: `文档源节点 "${entity.title || node.key}" 中的集成未定义`
		// 	},
		// 	level: 'error'
		// })

		return items
	}
}
