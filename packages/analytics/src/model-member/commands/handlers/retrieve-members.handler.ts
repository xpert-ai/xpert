import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Document } from '@langchain/core/documents'
import { ChatMessageEventTypeEnum, embeddingCubeCollectionName, TChatEventMessage } from '@metad/contracts'
import { t } from 'i18next'
import { RetrieveMembersCommand } from '../retrieve-members.command'
import { SemanticModelMemberService } from '../../member.service'
import { CreateVectorStoreCommand } from '../create-vector-store.command'
import { PGMemberVectorStore } from '../../vector-store'
import { SemanticModelService } from '../../../model'
import { EmbeddingMembersCommand } from '../embedding.command'

export const RETRIEVE_DEFAULT_TOPK = 1000

@CommandHandler(RetrieveMembersCommand)
export class RetrieveMembersHandler implements ICommandHandler<RetrieveMembersCommand> {
	private logger = new Logger(RetrieveMembersHandler.name)

	constructor(
		private readonly modelService: SemanticModelService,
		// private readonly service: SemanticModelMemberService,
		private readonly commandBus: CommandBus,) {}

	public async execute(command: RetrieveMembersCommand) {
		const { modelId, cube, dimension, hierarchy, level, dsCoreService, reEmbedding } = command.params
		const query = command.query
		const k = command.params.topK || RETRIEVE_DEFAULT_TOPK

		const model = await this.modelService.findOne(modelId, { select: ['id', 'key', 'options'] })
		// Check if the model has embedded members for the specified cube and dimension
		if (reEmbedding || !model.options?.embedded?.[cube]?.[dimension]) {
			const messageId = `semantic-model-${modelId}-${cube}-${dimension}`
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: messageId,
				title: t('analytics:Model.EmbeddingStart', { dimension }),
				status: 'running',
				created_date: new Date().toISOString(),
			} as TChatEventMessage)
			
			await this.commandBus.execute(new EmbeddingMembersCommand(dsCoreService, modelId, cube, {dimension, isDraft: false, messageId}))
			// Update the status of embedded dimension
			await this.modelService.updateModelOptions(modelId, (options) => {
				return {
					...(options ?? {}),
					embedded: {
						...(options.embedded ?? {}),
						[cube]: {
							...(options.embedded?.[cube] ?? {}),
							[dimension]: true
						}
					}
				}
			})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: messageId,
				title: t('analytics:Model.EmbeddingComplete', { dimension }),
				status: 'success',
				end_date: new Date().toISOString(),
			} as TChatEventMessage)
		}

		// Instantiate vector store with embeddings
		const id = embeddingCubeCollectionName(modelId, cube, false)
		// const id = options.modelId ? `${options.modelId}${options.cube ? ':' + options.cube : ''}` + (options.isDraft ? ':draft' : '') : 'default'
		const vectorStore = await this.commandBus.execute<CreateVectorStoreCommand, PGMemberVectorStore>(new CreateVectorStoreCommand(id))
		// const { vectorStore } = await this.getVectorStore(copilot, options.modelId, options.cube)
		if (vectorStore) {
			const filter = {} as any
			if (dimension) {
				filter.dimension = dimension
			}
			if (hierarchy) {
				filter.hierarchy = hierarchy
			}
			if (level) {
				filter.level = level
			}

			const docsWithScore = await vectorStore.similaritySearchWithScore(query, k, filter)
			// Convert vector space distance to similarity scores
			return docsWithScore.map((item) => [item[0], 1-item[1]] as [Document, number])
		}

		return []
	}
}
