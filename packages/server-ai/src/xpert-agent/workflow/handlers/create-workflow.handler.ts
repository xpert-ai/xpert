import { Annotation, END } from '@langchain/langgraph'
import { channelName, IXpert, WorkflowNodeTypeEnum } from '@metad/contracts'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { WorkflowNodeRegistry } from '@xpert-ai/plugin-sdk'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { CreateWorkflowNodeCommand } from '../create-workflow.command'
import { createHttpNode } from '../http'
import { createRouterNode } from '../router/index'
import { createSplitterNode } from '../splitter'
import { CreateWNKnowledgeRetrievalCommand } from '../create-wn-knowledge-retrieval.command'
import { CreateWNSubflowCommand } from '../create-wn-subflow.command'
import { createTemplateNode } from '../template'
import { CreateWNClassifierCommand } from '../create-wn-classifier.command'
import { createToolNode } from '../tool'
import { createAssignerNode } from '../assigner'
import { createAgentToolNode } from '../agent-tool'
import { createTriggerNode } from '../trigger'
import { createCodeNode, WorkflowCodeValidator } from '../code/index'
import { AgentStateAnnotation, nextWorkflowNodes, TStateChannel, TWorkflowGraphNode } from '../../../shared'
import { createAnswerNode } from '../answer/node'


@CommandHandler(CreateWorkflowNodeCommand)
export class CreateWorkflowNodeHandler implements ICommandHandler<CreateWorkflowNodeCommand> {
	readonly #logger = new Logger(CreateWorkflowNodeHandler.name)

	@Inject(WorkflowCodeValidator)
	private codeValidator: WorkflowCodeValidator

	@Inject(WorkflowNodeRegistry)
	private readonly nodeRegistry: WorkflowNodeRegistry

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
			case WorkflowNodeTypeEnum.TRIGGER: {
				workflow = createTriggerNode(graph, node, {
					conversationId: options.conversationId,
					xpertId,
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					environment: options.environment
				})
				break
			}
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
				workflow = createRouterNode(graph, node, {
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					environment: options.environment
				})
				break
			}
			case WorkflowNodeTypeEnum.ITERATING: {
				workflow = await this.commandBus.execute(new CreateWNIteratingCommand(xpertId, graph, node, options))
				break
			}
			case WorkflowNodeTypeEnum.ANSWER: {
				workflow = createAnswerNode(graph, node, {
					leaderKey: command.leaderKey,
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					xpertId,
					environment: options.environment,
					conversationId: options.conversationId
				})

				// await this.commandBus.execute(new CreateWNAnswerCommand(xpertId, graph, node, options))
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
					environment: options.environment,
					validator: this.codeValidator
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
			case WorkflowNodeTypeEnum.AGENT_TOOL: {
				workflow = createAgentToolNode(graph, node, {
					leaderKey: command.leaderKey,
					commandBus: this.commandBus,
					queryBus: this.queryBus,
					xpertId,
					environment: options.environment,
					conversationId: options.conversationId
				})
				break
			}
			// case WorkflowNodeTypeEnum.SOURCE: {
			// 	workflow = createSourceNode(graph, node, {
			// 		commandBus: this.commandBus,
			// 		queryBus: this.queryBus,
			// 		xpertId,
			// 		environment: options.environment
			// 	})
			// 	break
			// }
			// case WorkflowNodeTypeEnum.PROCESSOR: {
			// 	workflow = createProcessorNode(graph, node, {
			// 		commandBus: this.commandBus,
			// 		queryBus: this.queryBus,
			// 		xpertId,
			// 		environment: options.environment,
			// 		isDraft: options.isDraft
			// 	})
			// 	break
			// }
			// case WorkflowNodeTypeEnum.CHUNKER: {
			// 	workflow = createChunkerNode(graph, node, {
			// 		commandBus: this.commandBus,
			// 		queryBus: this.queryBus,
			// 		xpertId,
			// 		environment: options.environment
			// 	})
			// 	break
			// }
			// case WorkflowNodeTypeEnum.UNDERSTANDING: {
			// 	workflow = createUnderstandingNode(graph, node, {
			// 		commandBus: this.commandBus,
			// 		queryBus: this.queryBus,
			// 		xpertId,
			// 		environment: options.environment,
			// 		isDraft: options.isDraft
			// 	})
			// 	break
			// }
			// case WorkflowNodeTypeEnum.KNOWLEDGE_BASE: {
			// 	workflow = createKnowledgeBaseNode(graph, node, {
			// 		commandBus: this.commandBus,
			// 		queryBus: this.queryBus,
			// 		xpertId,
			// 		environment: options.environment,
			// 		isDraft: options.isDraft
			// 	})
			// 	break
			// }
			default:
				try {
					const creator = this.nodeRegistry.get(node.entity.type)

					const result = creator.create({graph, node, xpertId, environment: options.environment, isDraft: options.isDraft})

					workflow = {
						workflowNode: {
							name: result.name,
							graph: result.graph,
							ends: result.ends
						},
						channel: result.channel,
						navigator: result.navigator ?? (async (state: typeof AgentStateAnnotation.State, config) => {
							if (state[channelName(node.key)]['error']) {
								return (
									graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
									END
								)
							}
				
							return nextWorkflowNodes(graph, node.key, state)
						})
					}
					break
				} catch (error) {
				    throw new Error(`Unsupported workflow node type: ${node.entity?.type}: ${error.message}`)
				}
		}

		return {
			channel,
			...workflow,
			nextNodes: graph.connections
				.filter((_) => _.type === 'edge' && _.from.startsWith(node.key))
				.map((conn) =>
					graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to)
				)
		} as TWorkflowGraphNode
	}
}
