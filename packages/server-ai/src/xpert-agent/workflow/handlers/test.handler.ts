import { IWFNCode, IWFNKnowledgeRetrieval, IWorkflowNode, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { SandboxVMCommand } from '../../../sandbox'
import { XpertService } from '../../../xpert/xpert.service'
import { WorkflowTestNodeCommand } from '../test.command'
import { createWorkflowRetriever } from './create-wn-knowledge-retrieval.handler'

@CommandHandler(WorkflowTestNodeCommand)
export class WorkflowTestNodeHandler implements ICommandHandler<WorkflowTestNodeCommand> {
	readonly #logger = new Logger(WorkflowTestNodeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService,
		private readonly service: XpertService
	) {}

	public async execute(command: WorkflowTestNodeCommand) {
		const xpert = await this.service.findOne(command.xpertId, {})

		const graph = command.isDraft ? (xpert.draft ?? xpert.graph) : xpert.graph

		const node = graph.nodes.find((_) => _.key === command.key)

		if (node.type === 'workflow') {
			const entity = node.entity as IWorkflowNode
			switch (entity.type) {
				case WorkflowNodeTypeEnum.CODE: {
					const _entity = entity as IWFNCode
					const results = await this.commandBus.execute(
						new SandboxVMCommand(_entity.code, command.inputs, null, _entity.language)
					)
					return results
				}
				case WorkflowNodeTypeEnum.KNOWLEDGE: {
					const _entity = entity as IWFNKnowledgeRetrieval
					
					const retriever = createWorkflowRetriever(this.queryBus, _entity)
					const documents = await retriever?.invoke(command.inputs.query) ?? []
					
					return documents
				}
			}
		}
	}
}
