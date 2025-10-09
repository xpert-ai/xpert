import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { mapTranslationLanguage, VectorTypeEnum } from '@metad/contracts'
import { IPGVectorConfig } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { Inject, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { Pool } from 'pg'
import { RagCreateVStoreCommand } from '../create.command'

@CommandHandler(RagCreateVStoreCommand)
export class RagCreateVStoreHandler implements ICommandHandler<RagCreateVStoreCommand> {
	constructor(
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService,
		private readonly vectorStoreRegistry: VectorStoreRegistry,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {}

	public async execute(command: RagCreateVStoreCommand) {
		const vectorStore = environment.vectorStore
		switch (vectorStore) {
			case VectorTypeEnum.PGVECTOR:
				return this.createPgVectorStore(command.embeddings, command.config)
			default: {
				const strategy = this.vectorStoreRegistry.get(vectorStore)
				if (strategy) {
					return strategy.createStore(command.embeddings, command.config)
				}

				throw new InternalServerErrorException(
					await this.i18nService.t('xpert.Error.UnsupportedVectorStore', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
						args: { vectorStore: vectorStore }
					})
				)
			}
		}
	}

	async createPgVectorStore(embeddings: EmbeddingsInterface, config: { collectionName?: string }) {
		const _config = this.configService.get<IPGVectorConfig>('pgvector')

		const pgvstore = new PGVectorStore(embeddings, {
			pool: this.pgPool,
			tableName: 'knowledge_document_vector',
			collectionTableName: 'knowledge_document_collection',
			collectionName: config.collectionName,
			columns: {
				idColumnName: 'id',
				vectorColumnName: 'vector',
				contentColumnName: 'content',
				metadataColumnName: 'metadata'
			}
		})

		/**
		 * Create table for vector store if not exist
		 */
		await pgvstore.ensureTableInDatabase()
		await pgvstore.ensureCollectionTableInDatabase()
		return pgvstore
	}

	// async createMilvusVectorStore(embeddings: EmbeddingsInterface, config: {collectionName?: string}) {
	// }
}
