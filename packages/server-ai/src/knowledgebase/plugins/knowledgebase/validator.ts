import { ChecklistItem, IWFNKnowledgeBase, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowKnowledgeBaseNodeValidator {

	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNKnowledgeBase
		const items: ChecklistItem[] = []

		entity.inputs?.forEach((input, index) => {
			if (!input) {
				items.push({
					ruleCode: 'PIPELINE_KB_INPUT_EMPTY',
					node: node.key,
					field: 'inputs',
					value: input,
					level: 'error',
					message: {
						en_US: `Input at index ${index} is empty.`,
						zh_Hans: `索引 ${index} 处的输入为空。`
					}
				})
			}
		})

		// inputs should not have duplicates
		const duplicates = entity.inputs?.filter((item, index) => entity.inputs?.indexOf(item) !== index)
		if (duplicates?.length) {
			items.push({
				ruleCode: 'PIPELINE_KB_INPUT_DUPLICATE',
				node: node.key,
				field: 'inputs',
				value: duplicates.join(','),
				level: 'error',
				message: {
					en_US: `Input has duplicates: ${[...new Set(duplicates)].join(', ')}.`,
					zh_Hans: `输入有重复项：${[...new Set(duplicates)].join('，')}。`
				}
			})
		}

		return items
	}
}
