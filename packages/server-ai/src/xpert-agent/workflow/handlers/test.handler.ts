import { channelName, IWFNCode, IWFNKnowledgeRetrieval, IWorkflowNode, STATE_VARIABLE_HUMAN, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { SandboxVMCommand } from '../../../sandbox'
import { XpertService } from '../../../xpert/xpert.service'
import { WorkflowTestNodeCommand } from '../test.command'
import { createWorkflowRetriever } from './create-wn-knowledge-retrieval.handler'
import { createSourceNode } from '../source'
import { AgentStateAnnotation } from '../../../shared'

@CommandHandler(WorkflowTestNodeCommand)
export class WorkflowTestNodeHandler implements ICommandHandler<WorkflowTestNodeCommand> {
	readonly #logger = new Logger(WorkflowTestNodeHandler.name)

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
						new SandboxVMCommand(_entity.code, command.inputs, null, _entity.language)
					)
					return {
						...(typeof results?.result === 'object' ? results.result : { result: results?.result }),
						logs: results?.logs
					}
				}
				case WorkflowNodeTypeEnum.KNOWLEDGE: {
					const _entity = entity as IWFNKnowledgeRetrieval
					
					const retriever = createWorkflowRetriever(this.queryBus, _entity)
					const documents = await retriever?.invoke(command.inputs.query) ?? []
					
					return documents
				}
				case WorkflowNodeTypeEnum.SOURCE: {
					const { workflowNode } = createSourceNode(graph, node as IWorkflowNode & { type: 'workflow' }, {
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						xpertId: command.xpertId,
						environment: xpert.environment
					})

					const state = await workflowNode.graph.invoke({
						[STATE_VARIABLE_HUMAN]: {
							input: `Hi there`
						}
					} as typeof AgentStateAnnotation.State, {
						configurable: {
							knowledgebaseId: '123',
							knowledgeTaskId: '123',
						}
					})

					console.log('State: ', state)

					return state[channelName(node.key)]
				}
			}
		}
	}
}
