import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, embeddingCubeCollectionName, TChatEventMessage } from '@metad/contracts'
import { getEntityProperty, isEntityType, uuid } from '@metad/ocap-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { firstValueFrom } from 'rxjs'
import { PGMemberVectorStore } from '../../vector-store'
import { CreateVectorStoreCommand } from '../create-vector-store.command'
import { EmbeddingMembersCommand } from '../embedding.command'

const EMBEDDING_BATCH_SIZE = 50

@CommandHandler(EmbeddingMembersCommand)
export class EmbeddingMembersHandler implements ICommandHandler<EmbeddingMembersCommand> {
	private logger = new Logger(EmbeddingMembersHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: EmbeddingMembersCommand) {
		const { dsCoreService, modelKey, cube } = command
		const { dimension, isDraft, messageId } = command.params ?? {}

		if (!dimension) {
			throw new Error(
				t('Error.EmbeddingDimensionRequired', { ns: 'analytics' })
			)
		}

		const modelDataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))

		const entityType = await firstValueFrom(modelDataSource.selectEntityType(cube))
		if (!isEntityType(entityType)) {
			throw entityType
		}

		const dimensionProperty = getEntityProperty(entityType, dimension)
		if (!dimensionProperty) {
			throw new Error(
				t('Error.NoDimensionFound', { ns: 'analytics', cube: entityType.name, dimension })
			)
		}
		let members = []
		for (const hierarchy of dimensionProperty.hierarchies) {
			const _members = await firstValueFrom(
				modelDataSource.selectMembers(cube, {
					dimension: hierarchy.dimension,
					hierarchy: hierarchy.name
				})
			)
			members = members.concat(_members.map((item) => ({ ...item, modelId: modelKey, cube })))
		}

		const collectionName = embeddingCubeCollectionName(modelKey, cube, isDraft)
		const vectorStore = await this.commandBus.execute<CreateVectorStoreCommand, PGMemberVectorStore>(
			new CreateVectorStoreCommand(collectionName)
		)
		await vectorStore.deleteDimension(dimension)

		let count = 0
		while (EMBEDDING_BATCH_SIZE * count < members.length) {
			const batch = members.slice(EMBEDDING_BATCH_SIZE * count, EMBEDDING_BATCH_SIZE * (count + 1))
			// Record token usage
			// const tokenUsed = batch.reduce((total, doc) => total + estimateTokenUsage(doc.pageContent), 0)
			// await this.commandBus.execute(
			// 	new CopilotTokenRecordCommand({
			// 		tenantId,
			// 		organizationId,
			// 		userId: createdById,
			// 		copilotId: copilot.id,
			// 		tokenUsed,
			// 		model: getCopilotModel(copilot)
			// 	})
			// )

			await vectorStore.addMembers(
				batch.map((item) => ({ ...item, id: uuid() })),
				entityType
			)

			count++
			const progress =
				EMBEDDING_BATCH_SIZE * count >= members.length
					? 100
					: (((EMBEDDING_BATCH_SIZE * count) / members.length) * 100).toFixed(1)

			this.logger.debug(`Progress: ${progress}% for dimension '${dimension}' in cube '${cube}'`)

			if (messageId) {
				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
					id: messageId,
					message: `${progress}%`,
					status: 'running'
				} as TChatEventMessage)
			}
		}

		return
	}
}
