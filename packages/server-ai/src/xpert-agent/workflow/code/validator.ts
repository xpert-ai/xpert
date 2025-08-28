import { ChecklistItem, IWFNCode, TXpertTeamNode, workflowNodeIdentifier, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowCodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.CODE
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNCode
		const items: ChecklistItem[] = []
		entity.inputs.forEach((input) => {
			if (!input.variable) {
				items.push({
					node: node.key,
					ruleCode: 'INPUT_VARIABLE_REQUIRED',
					field: 'input',
					value: input.name,
					message: {
						en_US: `Input variable for "${input.name}" in Code node "${workflowNodeIdentifier(entity)}" is not defined`,
						zh_Hans: `代码节点 "${workflowNodeIdentifier(entity)}" 中的输入 "${input.name}" 未定义变量`
					},
					level: 'error'
				})
			}
		})

		return items
	}
}
