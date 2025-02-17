import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { Document } from '@langchain/core/documents'
import { Embeddings } from '@langchain/core/embeddings'
import { IKnowledgebase, IKnowledgeDocument } from '@metad/contracts'
import { Pool } from 'pg'

export type TVectorSearchParams = {
	take: number;
	skip: number;
	search?: string
}

export class KnowledgeDocumentVectorStore extends PGVectorStore {
	private model: string | null = null

	get embeddingModel() {
		return getCopilotModel(this.knowledgebase)
	}

	constructor(
		public knowledgebase: IKnowledgebase,
		public pgPool: Pool,

		embeddings?: Embeddings,
	) {
		const model = getCopilotModel(knowledgebase)

		super(embeddings, {
			pool: pgPool,
			tableName: 'knowledge_document_vector',
			collectionTableName: 'knowledge_document_collection',
			collectionName: knowledgebase.id,
			columns: {
				idColumnName: 'id',
				vectorColumnName: 'vector',
				contentColumnName: 'content',
				metadataColumnName: 'metadata'
			}
		})

		this.model = model
	}

	async getChunks(knowledgeId: string, options: TVectorSearchParams) {
		const filter = { knowledgeId }
		let collectionId: string
		if (this.collectionTableName) {
			collectionId = await this.getOrCreateCollection()
		}

		// Set parameters of dynamically generated query
		const params = collectionId ? [filter, collectionId] : [filter]

		let queryString = `SELECT * FROM ${this.computedTableName}
		  WHERE ${collectionId ? 'collection_id = $2 AND ' : ''}${this.metadataColumnName}::jsonb @> $1`

		if (options?.search) {
			queryString += ` AND ${this.contentColumnName} ILIKE '%' || $${params.length + 1} || '%'`
			params.push(options.search)
		}

		const take = options?.take || 100;
		const skip = options?.skip || 0;
		const paginatedQueryString = `${queryString} LIMIT ${take} OFFSET ${skip}`;

		const {rows} = await this.pool.query(paginatedQueryString, params)

		let countQueryString = `SELECT COUNT(*) FROM ${this.computedTableName}
		  WHERE ${collectionId ? 'collection_id = $2 AND ' : ''}${this.metadataColumnName}::jsonb @> $1`;

		if (options?.search) {
			countQueryString += ` AND ${this.contentColumnName} ILIKE '%' || $${params.length} || '%'`
		}

		const totalResult = await this.pool.query(countQueryString, params);
		const total = parseInt(totalResult.rows[0].count, 10);

		return {
			items: rows,
			total
		}
	}

	async addKnowledgeDocument(
		knowledgeDocument: IKnowledgeDocument,
		documents: Document<Record<string, any>>[]
	): Promise<void> {
		documents.forEach((item) => {
			item.metadata.knowledgeId = knowledgeDocument.id
			item.metadata.model = this.model
		})
		return await this.addDocuments(documents)
	}

	async deleteKnowledgeDocument(item: IKnowledgeDocument) {
		return await this.delete({ filter: { knowledgeId: item.id } })
	}

	async deleteChunk(id: string) {
		return await this.delete({ ids: [id] })
	}

	async updateChunk(id: string, chunk: Document<Record<string, any>>) {
		let collectionId: string;
		if (this.collectionTableName) {
			collectionId = await this.getOrCreateCollection();
		}
		if (chunk.metadata) {
			const currentMetadataQuery = `SELECT ${this.metadataColumnName} FROM ${this.computedTableName} WHERE ${this.idColumnName} = $1 AND collection_id = $2`;
			const currentMetadataResult = await this.pool.query(currentMetadataQuery, [id, collectionId]);
			const currentMetadata = currentMetadataResult.rows[0][this.metadataColumnName] || {};
			const updatedMetadata = { ...currentMetadata, ...chunk.metadata };
			const queryString = `UPDATE ${this.computedTableName} SET ${this.metadataColumnName} = $1::jsonb WHERE ${this.idColumnName} = $2 AND collection_id = $3`;
			const params = [updatedMetadata, id, collectionId];
			await this.pool.query(queryString, params);
		}
		if (chunk.pageContent) {
			const vector = await this.embeddings.embedDocuments([chunk.pageContent]);
			const updateVectorQuery = `UPDATE ${this.computedTableName} SET ${this.vectorColumnName} = $1, ${this.contentColumnName} = $2 WHERE ${this.idColumnName} = $3 AND collection_id = $4`;
			const vectorParams = [
				`[${vector.join(",")}]`,
				chunk.pageContent,
				id,
				collectionId
			];
			await this.pool.query(updateVectorQuery, vectorParams);
		}
	}

	async clear() {
		return await this.delete({ filter: {} })
	}

	/**
	 * Create table for vector store if not exist
	 */
	async ensureTableInDatabase() {
		await super.ensureTableInDatabase()
		await super.ensureCollectionTableInDatabase()
	}
}

function getCopilotModel(knowledgebase: IKnowledgebase) {
	return knowledgebase.copilotModel?.model || knowledgebase.copilotModel?.copilot?.copilotModel?.model
}
