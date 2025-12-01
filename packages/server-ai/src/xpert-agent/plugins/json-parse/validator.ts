import { ChecklistItem, IWFNJSONParse, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowJSONParseNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.JSON_PARSE
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNJSONParse
		const items: ChecklistItem[] = []

		if (!entity.inputVariable) {
			items.push({
				node: node.key,
				ruleCode: 'JSON_PARSE_INPUT_VARIABLE_EMPTY',
				field: 'inputVariable',
				value: '',
				message: {
					en_US: `JSON Parse node must have an input variable.`,
					zh_Hans: `JSON 解析节点必须有一个输入变量。`
				},
				level: 'error'
			})
		} 

		return items
	}
}
