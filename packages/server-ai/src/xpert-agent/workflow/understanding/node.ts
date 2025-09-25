import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
    channelName,
    IEnvironment,
    IWFNUnderstanding,
    IWorkflowNode,
    TAgentRunnableConfigurable,
    TXpertGraph,
    TXpertTeamNode,
    XpertParameterTypeEnum
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileSystemPermission, IImageUnderstandingStrategy, XpFileSystem } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { KnowledgebaseTaskService, KnowledgeStrategyQuery, KnowledgeTaskServiceQuery } from '../../../knowledgebase'
import { AgentStateAnnotation, nextWorkflowNodes, sandboxVolumeUrl, stateWithEnvironment, VolumeClient } from '../../../shared'
import { CopilotModelGetChatModelQuery } from 'packages/server-ai/src/copilot-model'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

export function createUnderstandingNode(
    graph: TXpertGraph,
    node: TXpertTeamNode & { type: 'workflow' },
    params: {
        commandBus: CommandBus
        queryBus: QueryBus
        xpertId: string
        environment: IEnvironment
        isDraft: boolean
    }
) {
    const { commandBus, queryBus, environment, isDraft } = params
    const entity = node.entity as IWFNUnderstanding

    return {
        workflowNode: {
            graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
                const configurable: TAgentRunnableConfigurable = config.configurable
                const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, knowledgebaseId, knowledgeTaskId } = configurable
                const stateEnv = stateWithEnvironment(state, environment)
                const value = get(stateEnv, entity.input) as string[]

                console.log('Image understanding input value:', value)

                const taskService = await queryBus.execute<KnowledgeTaskServiceQuery, KnowledgebaseTaskService>(
                    new KnowledgeTaskServiceQuery()
                )
                const task = await taskService.findOne(knowledgeTaskId)
                if (!task.context?.documents) {
                    throw new Error('No documents in knowledge task')
                }
                const documents = task.context.documents.filter((doc) => value.includes(doc.id))

                console.log('Image understanding documents:', documents)
                
                const strategy = await queryBus.execute<KnowledgeStrategyQuery, IImageUnderstandingStrategy>(
                    new KnowledgeStrategyQuery({
                        type: 'understanding',
                        name: entity.provider
                    })
                )

                const visionModel = entity.visionModel ? await queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(new CopilotModelGetChatModelQuery(
                    null, entity.visionModel, {
                            usageCallback: (token) => {
                                // execution.tokens += (token ?? 0)
                            }
                        })) : null
                
                const volume = VolumeClient._getWorkspaceRoot(
                                        RequestContext.currentTenantId(),
                                        'knowledges',
                                        knowledgebaseId
                                    )
                const fsPermission = strategy.permissions?.find(
                        (permission) => permission.type === 'filesystem'
                    ) as FileSystemPermission
                    const permissions = {}
                    if (fsPermission) {
                        const folder = isDraft ? 'temp/' : `${knowledgeTaskId}/`
                        permissions['fileSystem'] = new XpFileSystem(
                            fsPermission,
                            volume + '/' + folder,
                            sandboxVolumeUrl(`/knowledges/${knowledgebaseId}/${folder}`)
                        )
                    }
                for await (const doc of documents) {
                    const images = doc.metadata?.assets?.filter((asset) => asset.type === 'image')
					const result = await strategy.understandImages({
                            chunks: doc.chunks as any,
                            files: images
                        }, 
                        {
                            ...(entity.config ?? {}),
                            stage: isDraft ? 'test' : 'prod',
                            tempDir: volume + '/tmp/',
                            permissions,
                            visionModel
                        }
                    )

					doc.chunks = result.chunks
                    if (result.pages) {
						doc.pages = (doc.pages ?? []).concat(result.pages)
					}
					console.log('Chunker result chunks:', result.chunks)
				}

                await taskService.upsertDocuments(knowledgeTaskId, documents)

                return {
                    [channelName(node.key)]: {
                        [DocumentsChannelName]: documents.map((doc) => doc.id)
                    }
                }
            }),
            ends: []
        },
        channel: {
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
        },
        navigator: async (state: typeof AgentStateAnnotation.State, config) => {
            if (state[channelName(node.key)][ErrorChannelName]) {
                return (
                    graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
                    END
                )
            }

            return nextWorkflowNodes(graph, node.key, state)
        }
    }
}

export function understandingOutputVariables(entity: IWorkflowNode) {
    return [
        {
            type: XpertParameterTypeEnum.STRING,
            name: ErrorChannelName,
            title: 'Error',
            description: {
                en_US: 'Error info',
                zh_Hans: '错误信息'
            }
        },
        {
            type: XpertParameterTypeEnum.ARRAY_STRING,
            name: DocumentsChannelName,
            title: 'Documents',
            description: {
                en_US: 'Document IDs',
                zh_Hans: '文档IDs'
            }
        }
    ]
}
