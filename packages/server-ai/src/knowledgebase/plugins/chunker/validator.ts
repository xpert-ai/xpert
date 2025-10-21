import { ChecklistItem, IWFNChunker, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowChunkerNodeValidator {
	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.CHUNKER
		)
		const items: ChecklistItem[] = []
		codeNodes.forEach((node) => {
			items.push(...this.check(node))
		})
		return items
	}

	check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNChunker
		const items: ChecklistItem[] = []

		if (!entity.input) {
			items.push({
				node: node.key,
				field: 'input',
				value: entity.input,
				level: 'error',
				message: {
					en_US: `Input is required for Chunker node`,
					zh_Hans: `分块器节点的输入是必需的`
				},
				ruleCode: 'KNOWLEDGEBASE_CHUNKER_INPUT_REQUIRED'
			})
		}

		return items
	}
}
