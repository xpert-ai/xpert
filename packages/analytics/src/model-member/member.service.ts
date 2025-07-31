import { Document } from '@langchain/core/documents'
import { ISemanticModel } from '@metad/contracts'
import { DATABASE_POOL_TOKEN, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Pool } from 'pg'
import { DeepPartial, FindConditions, FindManyOptions, In, Repository } from 'typeorm'
import { SemanticModelMember } from './member.entity'
import { CreateVectorStoreCommand } from './commands/create-vector-store.command'
import { PGMemberVectorStore } from './vector-store'

@Injectable()
export class SemanticModelMemberService extends TenantOrganizationAwareCrudService<SemanticModelMember> {
	private readonly logger = new Logger(SemanticModelMemberService.name)

	// private readonly vectorStores = new Map<string, PGMemberVectorStore>()

	constructor(
		@InjectRepository(SemanticModelMember)
		modelCacheRepository: Repository<SemanticModelMember>,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,

		@Inject(DATABASE_POOL_TOKEN) private pgPool: Pool
	) {
		super(modelCacheRepository)
	}

	async bulkCreate(model: ISemanticModel, cube: string, members: DeepPartial<SemanticModelMember[]>) {
		// Remove previous members
		try {
			await this.bulkDelete(model.id, cube, {})
		} catch (err) {
			//
		}

		members = members.map((member) => ({
			...member,
			tenantId: model.tenantId,
			organizationId: model.organizationId,
			modelId: model.id,
			cube
		}))

		return await Promise.all(members.map((member) => this.create(member)))
	}

	async bulkDelete(modelId: string, cube: string, query: FindManyOptions<SemanticModelMember>) {
		query = query ?? {}
		const { items: members } = await this.findAll({
			...query,
			where: {
				...((query.where as FindConditions<SemanticModelMember>) ?? {}),
				modelId,
				cube
			}
		})
		return await this.delete({ id: In(members.map((item) => item.id)) })
	}

	/**
	 * Retrieve members with their similarity scores.
	 * 
	 * @param tenantId 
	 * @param organizationId 
	 * @param options 
	 * @param query 
	 * @param k 
	 * @returns 
	 */
	async retrieveMembersWithScore(
		tenantId: string,
		organizationId: string,
		options: {
			modelId: string | null
			cube: string
			dimension?: string
			hierarchy?: string
			level?: string
			isDraft?: boolean
		},
		query: string,
		k = 10
	) {
		// Use system embedding copilot model for embeddings
		// const copilot = await this.queryBus.execute(
		// 	new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding)
		// )
		// if (!copilot) {
		// 	throw new CopilotNotFoundException(`Copilot not found for role '${AiProviderRole.Embedding}'`)
		// }
		// Instantiate vector store with embeddings
		const id = options.modelId ? `${options.modelId}${options.cube ? ':' + options.cube : ''}` + (options.isDraft ? ':draft' : '') : 'default'
		const vectorStore = await this.commandBus.execute<CreateVectorStoreCommand, PGMemberVectorStore>(new CreateVectorStoreCommand(id))
		// const { vectorStore } = await this.getVectorStore(copilot, options.modelId, options.cube)
		if (vectorStore) {
			const filter = {} as any
			if (options.dimension) {
				filter.dimension = options.dimension
			}
			if (options.hierarchy) {
				filter.hierarchy = options.hierarchy
			}
			if (options.level) {
				filter.level = options.level
			}

			const docsWithScore = await vectorStore.similaritySearchWithScore(query, k, filter)
			// Convert vector space distance to similarity scores
			return docsWithScore.map((item) => [item[0], 1-item[1]] as [Document, number])
		}

		return []
	}

	/**
	 * Retrieve dimension members (documents) with query string filter by top K.
	 * 
	 * @param tenantId 
	 * @param organizationId 
	 * @param options 
	 * @param query 
	 * @param k 
	 * @returns 
	 */
	async retrieveMembers(
		tenantId: string,
		organizationId: string,
		options: {
			modelId: string | null
			cube: string
			dimension?: string
			hierarchy?: string
			level?: string
			isDraft?: boolean
		},
		query: string,
		k = 10
	) {
		const items = await this.retrieveMembersWithScore(tenantId, organizationId, options, query, k)
		return items?.map((item) => item[0])
	}

	// async getVectorStore(copilot: ICopilot, modelId: string, cube: string) {
	// 	const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
	// 		new CopilotModelGetEmbeddingsQuery(copilot, null, {
	// 			tokenCallback: (token) => {
	// 				console.log(`Embedding token usage:`, token)
	// 				// execution.tokens += (token ?? 0)
	// 			}
	// 		})
	// 	)

	// 	if (embeddings) {
	// 		const id = modelId ? `${modelId}${cube ? ':' + cube : ''}` : 'default'
	// 		if (!this.vectorStores.has(id)) {
	// 			const vectorStore = new PGMemberVectorStore(embeddings, {
	// 				pool: this.pgPool,
	// 				tableName: 'model_member_vector',
	// 				collectionTableName: 'model_member_collection',
	// 				collectionName: id,
	// 				columns: {
	// 					idColumnName: 'id',
	// 					vectorColumnName: 'vector',
	// 					contentColumnName: 'content',
	// 					metadataColumnName: 'metadata'
	// 				}
	// 			})

	// 			// Create table for vector store if not exist
	// 			await vectorStore.ensureTableInDatabase()

	// 			this.vectorStores.set(id, vectorStore)
	// 		}

	// 		return this.vectorStores.get(id)
	// 	}

	// 	return null
	// }
}
