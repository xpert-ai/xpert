import { ChecklistItem, IWFNTrigger, TXpertGraph, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowTriggerValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const triggerNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER
		)
		const items: ChecklistItem[] = []
		triggerNodes.forEach((node) => {
			items.push(...this.check(node, draft))
		})

		if (event.draft.team.agent.options?.hidden && triggerNodes.length === 0) {
			items.push({
				ruleCode: 'TRIGGER_NODE_MISSING',
				field: 'nodes',
				value: '',
				message: {
					en_US: `At least one trigger node is required when there is no primary agent`,
					zh_Hans: `无主智能体时至少需要一个触发器节点`
				},
				level: 'error'
			})
		}
		return items
	}

	check(node: TXpertTeamNode, graph: TXpertGraph) {
		const entity = <IWFNTrigger>node.entity
		const items: ChecklistItem[] = []
		const exist = graph.nodes.some(
			(n) =>
				n.type === 'workflow' &&
				n.entity.type === WorkflowNodeTypeEnum.TRIGGER &&
				(<IWFNTrigger>n.entity).from === entity.from &&
				n.key !== node.key
		)
		if (exist) {
			items.push({
				node: node.key,
				ruleCode: 'TRIGGER_NODE_DUPLICATE',
				field: 'from',
				value: entity.from,
				message: {
					en_US: `Trigger node "${entity.from}" is duplicated`,
					zh_Hans: `触发器节点 "${entity.from}" 重复`
				},
				level: 'error'
			})
		} else {
			entity.parameters?.forEach((param, index) => {
				if (!param.name) {
					items.push({
						node: node.key,
						ruleCode: 'TRIGGER_NODE_PARAMETER_NAME_EMPTY',
						field: 'parameters',
						value: `${index}`,
						message: {
							en_US: `Parameter name is empty`,
							zh_Hans: `参数名称为空`
						},
						level: 'error'
					})
				}
			})
		}
		return items
	}
}
