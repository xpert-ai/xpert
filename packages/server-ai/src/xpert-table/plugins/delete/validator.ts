import { ChecklistItem, IWFNDBDelete, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowDBDeleteNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const nodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.DB_DELETE
		)
		const items: ChecklistItem[] = []
		nodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNDBDelete
		const items: ChecklistItem[] = []

		if (!entity.tableId) {
			items.push({
				node: node.key,
				field: 'tableId',
				value: entity.tableId,
				level: 'error',
				message: {
					en_US: `Table is required for Database Delete node`,
					zh_Hans: `数据库删除节点需要表`
				},
				ruleCode: 'DB_DELETE_TABLE_REQUIRED'
			})
		}

		return items
	}
}
