import { ChecklistItem, IWFNJSONStringify, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowJSONStringifyNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.JSON_STRINGIFY
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNJSONStringify
		const items: ChecklistItem[] = []

		if (!entity.inputVariable) {
			items.push({
				node: node.key,
				ruleCode: 'JSON_STRINGIFY_INPUT_VARIABLE_EMPTY',
				field: 'inputVariable',
				value: '',
				message: {
					en_US: `JSON Stringify node must have an input variable.`,
					zh_Hans: `JSON 字符串化节点必须有一个输入变量。`
				},
				level: 'error'
			})
		} 

		return items
	}
}
