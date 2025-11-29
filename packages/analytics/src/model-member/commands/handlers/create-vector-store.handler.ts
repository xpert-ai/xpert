import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Inject, Logger } from '@nestjs/common'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { CreateVectorStoreCommand } from '../create-vector-store.command'
import { CopilotModelGetEmbeddingsQuery, CopilotNotFoundException, CopilotOneByRoleQuery } from '@metad/server-ai'
import { AiProviderRole, mapTranslationLanguage } from '@metad/contracts'
import { Embeddings } from '@langchain/core/embeddings'
import { Pool } from 'pg'
import { I18nService } from 'nestjs-i18n'
import { PGMemberVectorStore } from '../../vector-store'

@CommandHandler(CreateVectorStoreCommand)
export class CreateVectorStoreHandler implements ICommandHandler<CreateVectorStoreCommand> {
	private logger = new Logger(CreateVectorStoreHandler.name)

	private readonly vectorStores = new Map<string, PGMemberVectorStore>()
	constructor(
		private readonly queryBus: QueryBus,
		@Inject(DATABASE_POOL_TOKEN) private pgPool: Pool,
		private readonly i18n: I18nService
	) {}

	public async execute(command: CreateVectorStoreCommand) {
		const collectionName = command.collectionName

		// if (this.vectorStores.has(collectionName)) {
		// 	this.logger.debug(`Vector store for collection '${collectionName}' already exists`)
		// 	return this.vectorStores.get(collectionName)
		// }

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		// Use system embedding copilot model for embeddings
		const copilot = await this.queryBus.execute(
			new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding)
		)
		if (!copilot) {
			throw new CopilotNotFoundException(await this.i18n.t('xpert.Error.EmbeddingCopilotNotFound', {lang: mapTranslationLanguage(RequestContext.getLanguageCode())}))
		}

		const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
					new CopilotModelGetEmbeddingsQuery(copilot, null, {
						tokenCallback: (token) => {
							console.log(`Embedding token usage:`, token)
							// execution.tokens += (token ?? 0)
						}
					})
				)
		if (embeddings) {
			const vectorStore = new PGMemberVectorStore(embeddings, {
				pool: this.pgPool,
				tableName: 'model_member_vector',
				collectionTableName: 'model_member_collection',
				collectionName,
				columns: {
					idColumnName: 'id',
					vectorColumnName: 'vector',
					contentColumnName: 'content',
					metadataColumnName: 'metadata'
				}
			})

			// Create table for vector store if not exist
			await vectorStore.ensureTableInDatabase()

			this.vectorStores.set(collectionName, vectorStore)
			return {vectorStore, copilot}
		}

		this.logger.error(`Failed to create vector store for collection '${collectionName}' - embeddings not found`)
		return {
			vectorStore: null,
			copilot: null
		}
	}
}
