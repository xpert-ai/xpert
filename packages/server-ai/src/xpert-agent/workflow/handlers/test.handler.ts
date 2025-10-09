import {
	IWFNCode,
	IWFNKnowledgeRetrieval,
	IWorkflowNode,
	WorkflowNodeTypeEnum,
} from '@metad/contracts'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { WorkflowNodeRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxVMCommand } from '../../../sandbox'
import { AgentStateAnnotation } from '../../../shared'
import { XpertService } from '../../../xpert/xpert.service'
import { WorkflowTestNodeCommand } from '../test.command'
import { createWorkflowRetriever } from './create-wn-knowledge-retrieval.handler'


@CommandHandler(WorkflowTestNodeCommand)
export class WorkflowTestNodeHandler implements ICommandHandler<WorkflowTestNodeCommand> {
	readonly #logger = new Logger(WorkflowTestNodeHandler.name)

	@Inject(WorkflowNodeRegistry)
	private readonly nodeRegistry: WorkflowNodeRegistry

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
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
						new SandboxVMCommand(_entity.code, command.state, null, _entity.language)
					)
					return {
						...(typeof results?.result === 'object' ? results.result : { result: results?.result }),
						logs: results?.logs
					}
				}
				case WorkflowNodeTypeEnum.KNOWLEDGE: {
					const _entity = entity as IWFNKnowledgeRetrieval

					const retriever = createWorkflowRetriever(this.queryBus, _entity)
					const documents = (await retriever?.invoke(command.state.query)) ?? []

					return documents
				}
				default: {
					try {
						const creator = this.nodeRegistry.get(node.entity.type)
						const result = creator.create({
							graph,
							node,
							xpertId: xpert.id,
							environment: xpert.environment,
							isDraft: command.isDraft
						})
						const state = await result.graph.invoke(
							command.state as typeof AgentStateAnnotation.State,
							{
								configurable: {
								}
							}
						)

						console.log('State: ', state)
						return state
					} catch (error) {
						throw new Error(`Unsupported workflow node type: ${node.entity?.type}: ${error.message}`)
					}
				}
			}
		}
	}
}
