import { ChecklistItem, IWFNProcessor, TXpertTeamNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { GetIntegrationQuery } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowProcessorValidator {
	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	@OnEvent(EventNameXpertValidate)
	async handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const codeNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.PROCESSOR
		)
		const items: ChecklistItem[] = []
		for await (const node of codeNodes) {
			items.push(...(await this.check(node)))
		}
		return items
	}

	async check(node: TXpertTeamNode) {
		const entity = node.entity as IWFNProcessor
		const items: ChecklistItem[] = []

		if (entity.integrationId) {
			try {
				const integration = await this.queryBus.execute(new GetIntegrationQuery(entity.integrationId))
			} catch (error) {
				items.push({
					node: node.key,
					field: 'integrationId',
					value: entity.integrationId,
					message: {
						en_US: `System integration not found`,
						zh_Hans: `未找到系统集成`
					},
					level: 'error',
					ruleCode: 'KNOWLEDGEBASE_PROCESSOR_INTEGRATION_NOT_FOUND'
				})
			}
		}

		if (!entity.input) {
			items.push({
				node: node.key,
				field: 'input',
				message: {
					en_US: `Input variable is required`,
					zh_Hans: `输入变量是必需的`
				},
				level: 'error',
				ruleCode: 'KNOWLEDGEBASE_PROCESSOR_INPUT_REQUIRED'
			})
		}

		return items
	}
}
