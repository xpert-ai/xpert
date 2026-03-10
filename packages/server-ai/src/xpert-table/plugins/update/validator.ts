import { ChecklistItem, IWFNDBUpdate, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowDBUpdateNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const nodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.DB_UPDATE
		)
		const items: ChecklistItem[] = []
		nodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNDBUpdate
		const items: ChecklistItem[] = []

		if (!entity.tableId) {
			items.push({
				node: node.key,
				field: 'tableId',
				value: entity.tableId,
				level: 'error',
				message: {
					en_US: `Table is required for Database Update node`,
					zh_Hans: `数据库更新节点需要表`
				},
				ruleCode: 'DB_UPDATE_TABLE_REQUIRED'
			})
		}

		return items
	}
}
