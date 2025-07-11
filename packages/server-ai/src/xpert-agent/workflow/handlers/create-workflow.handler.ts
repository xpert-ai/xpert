import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { channelName, IXpert, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CreateWNAnswerCommand } from '../create-wn-answer.command'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { CreateWorkflowNodeCommand } from '../create-workflow.command'
import { TStateChannel } from '../../agent'
import { createHttpNode } from '../http'
import { createCasesNode } from '../cases'
import { createCodeNode } from '../code'
import { createSplitterNode } from '../splitter'
import { CreateWNKnowledgeRetrievalCommand } from '../create-wn-knowledge-retrieval.command'
import { CreateWNSubflowCommand } from '../create-wn-subflow.command'
import { createTemplateNode } from '../template'
import { CreateWNClassifierCommand } from '../create-wn-classifier.command'
import { createToolNode } from '../tool'
import { createAssignerNode } from '../assigner'
import { BaseMessage } from '@langchain/core/messages'

@CommandHandler(CreateWorkflowNodeCommand)
export class CreateWorkflowNodeHandler implements ICommandHandler<CreateWorkflowNodeCommand> {
	readonly #logger = new Logger(CreateWorkflowNodeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CreateWorkflowNodeCommand) {
		const { xpertId, graph, node, options } = command
		const { xpert } = options
		
		let workflow = {} as any
		let channel: TStateChannel = null
		switch (node.entity.type) {
			case WorkflowNodeTypeEnum.ASSIGNER: {
				workflow = createAssignerNode(graph, node, {
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					xpertId,
					environment: options.environment,
				})
				break
			}
			case WorkflowNodeTypeEnum.IF_ELSE: {
				workflow = createCasesNode(graph, node, {environment: options.environment})
				break
			}
			case WorkflowNodeTypeEnum.ITERATING: {
				workflow = await this.commandBus.execute(new CreateWNIteratingCommand(xpertId, graph, node, options))
				break
			}
			case WorkflowNodeTypeEnum.ANSWER: {
				workflow = await this.commandBus.execute(new CreateWNAnswerCommand(xpertId, graph, node, options))
				channel = {
					name: channelName(node.key),
					annotation: Annotation<{messages: BaseMessage[]} & Record<string, unknown>>({
						reducer: (a, b) => {
							return b
								? {
										...a,
										...b,
										messages: b.messages ? messagesStateReducer(a.messages, b.messages) : a.messages
									}
								: a
						},
						default: () => ({
							messages: []
						})
					})
				}
				break
			}
			case WorkflowNodeTypeEnum.CLASSIFIER: {
				workflow = await this.commandBus.execute(new CreateWNClassifierCommand(xpert as IXpert, graph, node, options))
				break
			}
			case WorkflowNodeTypeEnum.SPLITTER: {
				workflow = createSplitterNode(graph, node)
				break
			}
			case WorkflowNodeTypeEnum.CODE: {
				workflow = createCodeNode(graph, node, {
					xpertId, 
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					environment: options.environment
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
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					environment: options.environment
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
			case WorkflowNodeTypeEnum.SUBFLOW: {
				workflow =  await this.commandBus.execute(new CreateWNSubflowCommand(xpertId, graph, node, options))
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
			case WorkflowNodeTypeEnum.TEMPLATE: {
				workflow = createTemplateNode(graph, node, {
					xpertId, 
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					environment: options.environment
				})
				break
			}
			case WorkflowNodeTypeEnum.TOOL: {
				workflow = createToolNode(graph, node, {
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					xpertId,
					environment: options.environment,
					conversationId: options.conversationId
				})
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
