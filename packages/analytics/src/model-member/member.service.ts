import { PGVectorStore, PGVectorStoreArgs } from '@langchain/community/vectorstores/pgvector'
import { Document } from '@langchain/core/documents'
import type { Embeddings, EmbeddingsInterface } from '@langchain/core/embeddings'
import { ISemanticModel, ISemanticModelEntity, ICopilot, AiProviderRole } from '@metad/contracts'
import {
	EntityType,
	PropertyDimension,
	PropertyHierarchy,
	PropertyLevel,
	getEntityHierarchy,
	getEntityLevel,
	getEntityProperty,
	isEntityType
} from '@metad/ocap-core'
import { DATABASE_POOL_TOKEN, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Pool } from 'pg'
import { firstValueFrom } from 'rxjs'
import { DeepPartial, FindConditions, FindManyOptions, In, Repository } from 'typeorm'
import { NgmDSCoreService, getSemanticModelKey } from '../model/ocap'
import { SemanticModelMember } from './member.entity'
import { CopilotModelGetEmbeddingsQuery, CopilotNotFoundException, CopilotOneByRoleQuery } from '@metad/server-ai'
import { QueryBus } from '@nestjs/cqrs'

@Injectable()
export class SemanticModelMemberService extends TenantOrganizationAwareCrudService<SemanticModelMember> {
	private readonly logger = new Logger(SemanticModelMemberService.name)

	private readonly vectorStores = new Map<string, PGMemberVectorStore>()

	constructor(
		@InjectRepository(SemanticModelMember)
		modelCacheRepository: Repository<SemanticModelMember>,
		private readonly dsCoreService: NgmDSCoreService,
		private readonly queryBus: QueryBus,

		@Inject(DATABASE_POOL_TOKEN) private pgPool: Pool
	) {
		super(modelCacheRepository)
	}

	/**
	 * Sync dimension members from model source into members table and vector store table
	 *
	 * @param modelId
	 * @param body Cube name and it's hierarchies
	 */
	// async syncMembers(model: ISemanticModel, cube: string, hierarchies: string[], { id, createdById }: Partial<ISemanticModelEntity>) {
	// 	// const model = await this.modelRepository.findOne(modelId, {
	// 	// 	relations: ['dataSource', 'dataSource.type', 'roles']
	// 	// })
	// 	const modelKey = getSemanticModelKey(model)
	// 	const modelDataSource = await this.dsCoreService._getDataSource(modelKey)

	// 	this.logger.debug(`Sync members for dimensions: ${hierarchies} in cube: ${cube} of model: ${model.name} ...`)

	// 	const entityType = await firstValueFrom(modelDataSource.selectEntityType(cube))
	// 	if (!isEntityType(entityType)) {
	// 		throw entityType
	// 	}

	// 	this.logger.debug(`Got entity type: ${entityType.name}`)

	// 	const statistics = {}
	// 	let members = []
	// 	for (const hierarchy of hierarchies) {
	// 		const hierarchyProperty = getEntityHierarchy(entityType, hierarchy)
	// 		const _members = await firstValueFrom(
	// 			modelDataSource.selectMembers(cube, {
	// 				dimension: hierarchyProperty.dimension,
	// 				hierarchy: hierarchyProperty.name
	// 			})
	// 		)

	// 		statistics[hierarchy] = _members.length
	// 		members = members.concat(_members.map((item) => ({ ...item, modelId: model.id, entityId: id, cube })))
	// 	}

	// 	this.logger.debug(`Got entity members: ${members.length}`)

	// 	// if (members.length) {
	// 	// 	await this.storeMembers(model, cube, members.map((member) => ({...member, createdById })), entityType)
	// 	// }

	// 	return {
	// 		entityType,
	// 		members,
	// 		statistics
	// 	}
	// }

	// /**
	//  * Store the members of specified dimension using Cube as the smallest unit.
	//  */
	// async storeMembers(model: SemanticModel, cube: string, members: DeepPartial<SemanticModelMember[]>, entityType: EntityType) {
	// 	const entities = await this.bulkCreate(model, cube, members)
		
	// 	if (vectorStore) {
	// 		await vectorStore.clear()
	// 		await vectorStore.addMembers(entities, entityType)
	// 		await Promise.all(entities.map((entity) => this.update(entity.id, { vector: true })))
	// 	}

	// 	return entities
	// }

	async bulkCreate(model: ISemanticModel, cube: string, members: DeepPartial<SemanticModelMember[]>) {
		// Remove previous members
		try {
			await this.bulkDelete(model.id, cube, {})
		} catch (err) {}

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

	async retrieveMembers(tenantId: string, organizationId: string, options: {
				modelId: string | null; 
				cube: string; 
				dimension?: string; 
				hierarchy?: string; 
				level?: string
			}, 
			query: string, 
			k = 10
	) {
		const copilot = await this.queryBus.execute(new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding))
		if (!copilot) {
			throw new CopilotNotFoundException(`Copilot not found for role '${AiProviderRole.Embedding}'`)
		}
		const { vectorStore } = await this.getVectorStore(copilot, options.modelId, options.cube)
		if (vectorStore) {
			try {
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

				return docsWithScore.map((item) => item[0])
			} catch (error) {
				return []
			}
		}

		return []
	}

	async getVectorStore(copilot: ICopilot, modelId: string, cube: string) {
		const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
			new CopilotModelGetEmbeddingsQuery(copilot, null, {
				tokenCallback: (token) => {
					console.log(`Embedding token usage:`, token)
				    // execution.tokens += (token ?? 0)
				}
			})
		)

		if (embeddings) {
			const id = modelId ? `${modelId}${cube ? ':' + cube : ''}` : 'default'
			if (!this.vectorStores.has(id)) {
				const vectorStore = new PGMemberVectorStore(embeddings, {
					pool: this.pgPool,
					tableName: 'model_member_vector',
					collectionTableName: 'model_member_collection',
					collectionName: id,
					columns: {
						idColumnName: 'id',
						vectorColumnName: 'vector',
						contentColumnName: 'content',
						metadataColumnName: 'metadata'
					}
				})

				// Create table for vector store if not exist
				await vectorStore.ensureTableInDatabase()

				this.vectorStores.set(id, vectorStore)
			}

			return this.vectorStores.get(id)
		}

		return null
	}
}

class PGMemberVectorStore {
	vectorStore: PGVectorStore

	constructor(
		embeddings: EmbeddingsInterface,
		_dbConfig: PGVectorStoreArgs
	) {
		this.vectorStore = new PGVectorStore(embeddings, _dbConfig)
	}

	async addMembers(members: SemanticModelMember[], entityType: EntityType) {
		if (!members.length) return

		const documents = members.map(
			(member) => {
				const dimensionProperty = getEntityProperty(entityType, member.dimension)
				const hierarchyProperty = getEntityHierarchy(entityType, member.hierarchy)
				const levelProperty = getEntityLevel(entityType, member)

				return new Document({
					metadata: {
						id: member.id,
						key: member.memberKey,
						dimension: member.dimension,
						hierarchy: member.hierarchy,
						level: member.level,
						member: member.memberName
					},
					pageContent: formatMemberContent(member, dimensionProperty, hierarchyProperty, levelProperty)
				})
			}
				
		)

		return this.vectorStore.addDocuments(documents, {ids: members.map((member) => member.id)})
	}

	similaritySearch(query: string, k: number) {
		return this.vectorStore.similaritySearch(query, k)
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
