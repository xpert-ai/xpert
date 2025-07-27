import { mapTranslationLanguage, VectorTypeEnum } from '@metad/contracts'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { Inject, InternalServerErrorException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { ConfigService } from '@nestjs/config'
import { environment } from '@metad/server-config'
import { IMilvusConfig, IPGVectorConfig } from '@metad/server-common'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { Callbacks } from '@langchain/core/callbacks/manager'
import { Pool } from 'pg'
import { RagCreateVStoreCommand } from '../create.command'
import { Milvus } from '../../milvus'

const MilvusTextFieldMaxLength = 10000


@CommandHandler(RagCreateVStoreCommand)
export class RagCreateVStoreHandler implements ICommandHandler<RagCreateVStoreCommand> {
	constructor(
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {}

	public async execute(command: RagCreateVStoreCommand) {
		
		const vectorStore = environment.vectorStore
		switch (vectorStore) {
			case VectorTypeEnum.PGVECTOR:
				return this.createPgVectorStore(command.embeddings, command.config);
			case VectorTypeEnum.MILVUS:
				return this.createMilvusVectorStore(command.embeddings, command.config);
			default:
				throw new InternalServerErrorException(
					await this.i18nService.t('xpert.Error.UnsupportedVectorStore', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
						args: { vectorStore: vectorStore }
					})
				);
		}
	
		
	}

	async createPgVectorStore(embeddings: EmbeddingsInterface, config: {collectionName?: string}) {
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
			},
		})

		/**
		 * Create table for vector store if not exist
		 */
		await pgvstore.ensureTableInDatabase()
		await pgvstore.ensureCollectionTableInDatabase()
		return pgvstore;
	}

	async createMilvusVectorStore(embeddings: EmbeddingsInterface, config: {collectionName?: string}) {
		const _config = this.configService.get<IMilvusConfig>(VectorTypeEnum.MILVUS)
		const vstore = new MilvusStore(embeddings, {
				collectionName: sanitizeUUID(config.collectionName),
				url: _config.MILVUS_URI,
				username: _config.MILVUS_USER,
				password: _config.MILVUS_PASSWORD,
				clientConfig: {
					address: _config.MILVUS_URI,
					token: _config.MILVUS_TOKEN,
					username: _config.MILVUS_USER,
					password: _config.MILVUS_PASSWORD,
				},
				textFieldMaxLength: MilvusTextFieldMaxLength
			});
		// await vstore.ensureCollection()
		await vstore.ensurePartition()
		return vstore
	}
}

function sanitizeUUID(uuid: string): string {
    // Remove hyphens from UUIDs and replace with underscores
    return '_' + uuid.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

class MilvusStore extends Milvus {

	similaritySearch(query: string, k?: number, filter?: this["FilterType"] | undefined, _callbacks?: Callbacks | undefined) {
		return super.similaritySearch(query, k, this.filterString(filter), _callbacks);
	}

	similaritySearchWithScore(query: string, k?: number, filter?: this["FilterType"] | undefined, _callbacks?: Callbacks | undefined) {
		return super.similaritySearchWithScore(query, k, this.filterString(filter), _callbacks);
	}

	delete(params: {
        filter?: string | Record<string, any>;
        ids?: string[];
    }) {
		const { filter, ids } = params ?? {};
		if (ids && ids.length > 0) {
			params.filter = `chunk_id in [${ids.map((id) => `"${id}"`).join(',')}]`
			delete params.ids
		} else if (filter && typeof filter === 'object') {
			// Convert filter object to string if necessary
			params.filter = this.filterString(filter);
		}
		return super.delete(params as any)
	}

	filterString(filter: string | Record<string, any>): string {
		if (!filter) {
			return null
		}
		if (typeof filter === 'string') {
			return filter;
		}
		return Object.entries(filter).map(([key, value]) => {
			if (typeof value === 'string') {
				return `${key} == '${value}'`
			} else if (typeof value === 'object') {
				if (Array.isArray(value)) {
					return `${key} IN [${value.map((v) => `'${v}'`).join(',')}]`
				} else if ('in' in value) {
					return `${key} IN [${value.in.map((v) => `'${v}'`).join(',')}]`
				}
				return `${key} == ${value}`
			} else if (typeof value === 'number') {
				return `${key} == ${value}`
			} else if (typeof value === 'boolean') {
				return `${key} == ${value}`
			}
			return `${key} == '${value}'`
		}).join(' AND ');
	}
}