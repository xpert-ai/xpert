import { Annotation } from '@langchain/langgraph'
import { channelName, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { createCasesNode } from '../../workflow'
import { createCodeNode } from '../../workflow/code'
import { createSplitterNode } from '../../workflow/splitter'
import { CreateWNAnswerCommand } from '../create-wn-answer.command'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { CreateWorkflowNodeCommand } from '../create-workflow.command'
import { TStateChannel } from '../../agent'
import { createHttpNode } from '../http'
import { CreateWNKnowledgeRetrievalCommand } from '../create-wn-knowledge-retrieval.command'

@CommandHandler(CreateWorkflowNodeCommand)
export class CreateWorkflowNodeHandler implements ICommandHandler<CreateWorkflowNodeCommand> {
	readonly #logger = new Logger(CreateWorkflowNodeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CreateWorkflowNodeCommand) {
		const { xpertId, graph, node, leaderKey, options } = command
		
		let workflow = {} as any
		let channel: TStateChannel = null
		switch (node.entity.type) {
			case WorkflowNodeTypeEnum.IF_ELSE: {
				workflow = createCasesNode(graph, node)
				break
			}
			case WorkflowNodeTypeEnum.ITERATING: {
				workflow = await this.commandBus.execute(new CreateWNIteratingCommand(xpertId, graph, node, options))
				break
			}
			case WorkflowNodeTypeEnum.ANSWER: {
				workflow = await this.commandBus.execute(new CreateWNAnswerCommand(xpertId, graph, node, options))
				break
			}
			case WorkflowNodeTypeEnum.SPLITTER: {
				workflow = createSplitterNode(graph, node)
				break
			}
			case WorkflowNodeTypeEnum.CODE: {
				workflow = createCodeNode(graph, node, {
					xpertId, 
					rootExecutionId: options.rootExecutionId,
					commandBus: this.commandBus,
					queryBus: this.queryBus,
				})
				channel = {
					name: channelName(node.key),
					annotation: Annotation<Record<string, unknown>>({
						reducer: (a, b) => {
							return b
								? {
										...a,
										...b
									}
								: a
						},
						default: () => ({})
					})
				}
				break
			}
			case WorkflowNodeTypeEnum.HTTP: {
				workflow = createHttpNode(graph, node, {
					xpertId, 
					rootExecutionId: options.rootExecutionId,
					commandBus: this.commandBus,
					queryBus: this.queryBus,
				})
				channel = {
					name: channelName(node.key),
					annotation: Annotation<Record<string, unknown>>({
						reducer: (a, b) => {
							return b
								? {
										...a,
										...b
									}
								: a
						},
						default: () => ({})
					})
				}
				break
			}
			case WorkflowNodeTypeEnum.KNOWLEDGE: {
				workflow =  await this.commandBus.execute(new CreateWNKnowledgeRetrievalCommand(xpertId, graph, node, options))
				channel = {
					name: channelName(node.key),
					annotation: Annotation<Record<string, unknown>>({
						reducer: (a, b) => {
							return b
								? {
										...a,
										...b
									}
								: a
						},
						default: () => ({})
					})
				}
				break
			}
		}

		return {
			...workflow,
			channel,
			nextNodes: graph.connections
				.filter((_) => _.type === 'edge' && _.from.startsWith(node.key))
				.map((conn) =>
					graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to)
				)
		}
	}
}
