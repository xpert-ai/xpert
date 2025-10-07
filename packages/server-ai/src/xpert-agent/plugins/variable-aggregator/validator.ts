import { ChecklistItem, IWFNVariableAggregator, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowVariableAggregatorNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNVariableAggregator
		const items: ChecklistItem[] = []

		if (!entity.inputs || entity.inputs.length === 0) {
			items.push({
				node: node.key,
				ruleCode: 'VARIABLE_AGGREGATOR_INPUTS_EMPTY',
				field: 'inputs',
				value: JSON.stringify(entity.inputs),
				message: {
					en_US: `Variable Aggregator node must have at least one input variable.`,
					zh_Hans: `变量聚合器节点必须至少有一个输入变量。`
				},
				level: 'error'
			})
		} else if (entity.inputs.some((input) => !input)) {
			items.push({
				node: node.key,
				ruleCode: 'VARIABLE_AGGREGATOR_INPUTS_INVALID',
				field: 'inputs',
				value: JSON.stringify(entity.inputs),
				message: {
					en_US: `Variable Aggregator node has invalid input variables.`,
					zh_Hans: `变量聚合器节点有无效的输入变量。`
				},
				level: 'error'
			})
		}

		return items
	}
}
