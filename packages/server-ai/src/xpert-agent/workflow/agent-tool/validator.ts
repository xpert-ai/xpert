import {
	ChecklistItem,
	IWFNAgentTool,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowAgentToolValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.AGENT_TOOL
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNAgentTool
		const items: ChecklistItem[] = []
		if (!entity.toolName) {
			items.push({
				node: node.key,
				ruleCode: 'AGENT_TOOL_NAME_EMPTY',
				field: 'toolName',
				value: entity.toolName,
				message: {
					en_US: `Tool name is empty, the node key is used as the tool name.`,
					zh_Hans: `工具名称是空的，则使用节点键作为工具名称`
				},
				level: 'warning'
			})
		}

		return items
	}
}
