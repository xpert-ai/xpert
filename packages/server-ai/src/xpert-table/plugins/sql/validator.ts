import { ChecklistItem, IWFNDBSql, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowDBSqlNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.DB_SQL
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNDBSql
		const items: ChecklistItem[] = []

		if (!entity.tableId) {
			items.push({
				node: node.key,
				field: 'tableId',
				value: entity.tableId,
				level: 'error',
				message: {
					en_US: `Table is required for Database Insert node`,
					zh_Hans: `数据库插入节点需要表`
				},
				ruleCode: 'DB_INSERT_TABLE_REQUIRED'
			})
		}
		return items
	}
}
