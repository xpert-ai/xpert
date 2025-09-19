import { PGVectorStore, PGVectorStoreArgs } from "@langchain/community/vectorstores/pgvector"
import { EmbeddingsInterface } from "@langchain/core/embeddings"
import { SemanticModelMember } from "./member.entity"
import {
    DeepPartial,
	EntityType,
	PropertyDimension,
	PropertyHierarchy,
	PropertyLevel,
	getEntityHierarchy,
	getEntityLevel,
	getEntityProperty
} from '@metad/ocap-core'
import { Document } from '@langchain/core/documents'

export class PGMemberVectorStore {
	vectorStore: PGVectorStore

	constructor(embeddings: EmbeddingsInterface, _dbConfig: PGVectorStoreArgs) {
		this.vectorStore = new PGVectorStore(embeddings, _dbConfig)
	}

	async addMembers(members: SemanticModelMember[], entityType: EntityType) {
		if (!members.length) return

		const documents = members.map((member) => {
			const dimensionProperty = getEntityProperty(entityType, member.dimension)
			const hierarchyProperty = getEntityHierarchy(entityType, member.hierarchy)
			const levelProperty = getEntityLevel(entityType, member)

			return new Document({
				metadata: {
					id: member.id,
					key: member.memberKey,
					caption: member.memberCaption,
					dimension: member.dimension,
					hierarchy: member.hierarchy,
					level: member.level,
					member: member.memberName
				},
				pageContent: formatMemberContent(member, dimensionProperty, hierarchyProperty, levelProperty)
			})
		})

		return this.vectorStore.addDocuments(documents, { ids: members.map((member) => member.id) })
	}

	similaritySearch(query: string, k: number) {
		return this.vectorStore.similaritySearch(query, k)
	}

	similaritySearchWithScore(query: string, k: number, filter?: DeepPartial<SemanticModelMember>) {
		return this.vectorStore.similaritySearchWithScore(query, k, filter)
	}

	async deleteDimension(dimension: string) {
		await this.vectorStore.delete({ filter: { dimension } })
	}

	async clear() {
		await this.vectorStore.delete({ filter: {} })
	}

	/**
	 * Create table for vector store if not exist
	 */
	async ensureTableInDatabase() {
		await this.vectorStore.ensureTableInDatabase()
		await this.vectorStore.ensureCollectionTableInDatabase()
	}
}

function formatMemberContent(
	member: DeepPartial<SemanticModelMember>,
	dimensionProperty: PropertyDimension,
	hierarchyProperty: PropertyHierarchy,
	levelProperty: PropertyLevel
) {
	return `${member.memberCaption || ''} ${member.memberKey}`
}
