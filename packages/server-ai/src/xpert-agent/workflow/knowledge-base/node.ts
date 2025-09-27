// import { RunnableLambda } from '@langchain/core/runnables'
// import { Annotation, END } from '@langchain/langgraph'
// import {
// 	channelName,
// 	IEnvironment,
// 	IWFNKnowledgeBase,
// 	IXpertAgentExecution,
// 	TAgentRunnableConfigurable,
// 	TXpertGraph,
// 	TXpertTeamNode,
// 	WorkflowNodeTypeEnum,
// } from '@metad/contracts'
// import { CommandBus, QueryBus } from '@nestjs/cqrs'
// import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'
// import { get } from 'lodash'
// import { wrapAgentExecution } from '../../../shared/agent/execution'

// const ErrorChannelName = 'error'

// export function createKnowledgeBaseNode(
// 	graph: TXpertGraph,
// 	node: TXpertTeamNode & { type: 'workflow' },
// 	params: {
// 		commandBus: CommandBus
// 		queryBus: QueryBus
// 		xpertId: string
// 		environment: IEnvironment
// 		isDraft: boolean
// 	}
// ) {
// 	const { commandBus, queryBus, environment, isDraft } = params
// 	const entity = node.entity as IWFNKnowledgeBase

// 	return {
// 		workflowNode: {
// 			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
// 				const configurable: TAgentRunnableConfigurable = config.configurable
// 				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
// 				const stateEnv = stateWithEnvironment(state, environment)

// 				const value = get(stateEnv, entity.input)

// 				console.log('Knowledge Base Input:', entity.input, value)

// 				const execution: IXpertAgentExecution = {
// 									category: 'workflow',
// 									type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
// 									inputs: value,
// 									parentId: executionId,
// 									threadId: thread_id,
// 									checkpointNs: checkpoint_ns,
// 									checkpointId: checkpoint_id,
// 									agentKey: node.key,
// 									title: entity.title
// 								}
// 				return await wrapAgentExecution(
// 					async () => {

// 						if (isDraft) {
// 							//
// 						}

// 						return {
// 							state: {
// 								[channelName(node.key)]: {}
// 							}
// 						}
// 					},
// 					{
// 						commandBus: commandBus,
// 						queryBus: queryBus,
// 						subscriber: subscriber,
// 						execution
// 					})()
// 			}),
// 			ends: []
// 		},
//         channel: {
//             name: channelName(node.key),
//             annotation: Annotation<Record<string, unknown>>({
//                 reducer: (a, b) => {
//                     return b
//                         ? {
//                             ...a,
//                             ...b
//                         }
//                         : a
//                 },
//                 default: () => ({})
//             })
//         },
// 		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
// 			if (state[channelName(node.key)][ErrorChannelName]) {
// 				return (
// 					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
// 					END
// 				)
// 			}

// 			return nextWorkflowNodes(graph, node.key, state)
// 		}
// 	}
// }
