import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IStorageFile,
	IWFNProcessor,
	IWorkflowNode,
	IXpertAgentExecution,
	STATE_VARIABLE_FILES,
	STATE_VARIABLE_HUMAN,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { GetStorageFileQuery, RequestContext } from '@metad/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileSystemPermission, IDocumentTransformerStrategy, TDocumentTransformerFile, XpFileSystem } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { KnowledgebaseTaskService } from '../../../knowledgebase'
import { KnowledgeStrategyQuery, KnowledgeTaskServiceQuery } from '../../../knowledgebase/queries'
import { AgentStateAnnotation, nextWorkflowNodes, sandboxVolumeUrl, stateWithEnvironment, VolumeClient } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'


const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

export function createProcessorNode(
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
	const entity = node.entity as IWFNProcessor

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const {
					thread_id,
					checkpoint_ns,
					checkpoint_id,
					subscriber,
					executionId,
					knowledgebaseId,
					knowledgeTaskId
				} = configurable

				const stateEnv = stateWithEnvironment(state, environment)
				let input: string | string[] | TDocumentTransformerFile[] = null
				const value = get(stateEnv, entity.input)

				const execution: IXpertAgentExecution = {
									category: 'workflow',
									type: WorkflowNodeTypeEnum.PROCESSOR,
									inputs: value,
									parentId: executionId,
									threadId: thread_id,
									checkpointNs: checkpoint_ns,
									checkpointId: checkpoint_id,
									agentKey: node.key,
									title: entity.title
								}
				return await wrapAgentExecution(
					async () => {

						const humanFilesName = `${STATE_VARIABLE_HUMAN}.${STATE_VARIABLE_FILES}`
						const files: TDocumentTransformerFile[] = []
						if (entity.input === humanFilesName) {
							const storageFiles = await queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
								new GetStorageFileQuery(value.map((file) => file.id))
							)
							for (const file of storageFiles) {
								const extname = file.originalName?.split('.').pop()?.toLowerCase()
								files.push({
									url: file.fileUrl,
									filename: file.originalName,
									extname
								})
							}

							input = files
						} else {
							input = value
						}

						const strategy = await queryBus.execute<KnowledgeStrategyQuery, IDocumentTransformerStrategy>(
							new KnowledgeStrategyQuery({
								type: 'processor',
								name: entity.provider
							})
						)

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
						const results = await strategy.transformDocuments(input, {
							...(entity.config ?? {}),
							stage: isDraft ? 'test' : 'prod',
							tempDir: volume + '/tmp/',
							permissions
						})

						console.log(JSON.stringify(results, null, 2))

						// Update knowledge task progress
						const taskService = await queryBus.execute<KnowledgeTaskServiceQuery, KnowledgebaseTaskService>(
							new KnowledgeTaskServiceQuery()
						)

						const documents = results.map((result) => {
							return {
								id: shortuuid(),
								chunks: result.chunks,
								metadata: result.metadata
							} as IKnowledgeDocument
						})
						await taskService.upsertDocuments(knowledgeTaskId, documents)

						return {
							state: {
								[channelName(node.key)]: {
									[DocumentsChannelName]: documents.map((result) => result.id)
								}
							},
							output: JSON.stringify(documents.map((doc) => {
								doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
								doc.pages = doc.pages?.slice(0, 2)
								return doc
							}), null, 2)
						}
					},
					{
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					}
				)()
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

export function processorOutputVariables(entity: IWorkflowNode) {
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
				en_US: 'Documents IDs',
				zh_Hans: '文档IDs'
			}
		}
	]
}
