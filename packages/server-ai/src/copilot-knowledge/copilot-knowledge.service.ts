import { PGVectorStore, PGVectorStoreArgs } from '@langchain/community/vectorstores/pgvector'
import { Document } from '@langchain/core/documents'
import type { Embeddings, EmbeddingsInterface } from '@langchain/core/embeddings'
import { MaxMarginalRelevanceSearchOptions } from '@langchain/core/vectorstores'
import {
	AiBusinessRole,
	AiProviderRole,
	ICopilot,
	ICopilotKnowledge,
	IXpert,
	XpertTypeEnum,
} from '@metad/contracts'
import { DATABASE_POOL_TOKEN, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { compact, uniq } from 'lodash'
import { Pool } from 'pg'
import { DeleteResult, FindManyOptions, FindOneOptions, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { CopilotService } from '../copilot/copilot.service'
import { CopilotKnowledge } from './copilot-knowledge.entity'
import { isEqual } from 'date-fns/isEqual'
import { pick } from '@metad/server-common'
import { XpertCreateCommand } from '../xpert'
import { CopilotModelGetEmbeddingsQuery } from '../copilot-model/queries'

@Injectable()
export class CopilotKnowledgeService extends TenantOrganizationAwareCrudService<CopilotKnowledge> {
	readonly #logger = new Logger(CopilotKnowledgeService.name)

	private readonly vectorStores = new Map<string, PGMemberVectorStore>()

	constructor(
		@InjectRepository(CopilotKnowledge)
		repository: Repository<CopilotKnowledge>,
		private copilotService: CopilotService,
		@Inject(DATABASE_POOL_TOKEN) private pgPool: Pool,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {
		super(repository)
	}

	async similaritySearch(
		query: string,
		options?: {
			role?: AiBusinessRole
			command: string | string[]
			k: number
			filter: PGVectorStore['filter']
			score?: number
			tenantId?: string
			organizationId?: string
		}
	) {
		const { role, command, k, score, filter } = options ?? {}
		const commands = Array.isArray(command) ? { in: command } : command

		const tenantId = options?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = options?.organizationId ?? RequestContext.getOrganizationId()
		let vectorStore = await this.getVectorStore(tenantId, organizationId, role)
		if (vectorStore) {
			// console.log(`Got vectorStore for tenantId ${tenantId} organizationId ${organizationId} role ${role}`)

			let results = []
			try {
				results = await vectorStore.vectorStore.similaritySearchWithScore(query, k, {
					...(filter ?? {}),
					command: commands
				})
			} catch (error) {
				results = []
			}

			// If no results found (index not exist for role or examples for command not exist in the role)
			// try to search in default examples
			if (!results.length) {
				if (role) {
					this.#logger.debug(
						`Examples does not exist for role: ${role} with command '${command}'. use examples in default instead`
					)
					vectorStore = await this.getVectorStore(tenantId, organizationId, null)
					try {
						results = await vectorStore.vectorStore.similaritySearchWithScore(query, k, {
							...(filter ?? {}),
							command: commands
						})

						if (!results.length) {
							this.#logger.debug(
								`Search '${query}' examples for command '${command}' does not exist in default.`
							)
						}
					} catch (error) {
						this.#logger.error(error)
						results = []
					}
				}
			}

			return results.filter(([, _score]) => 1 - _score > (score ?? 0.7)).map(([doc]) => doc)
		}

		return []
	}

	async maxMarginalRelevanceSearch(
		query: string,
		options?: {
			role?: AiBusinessRole
			command?: string | string[]
			k: number
			filter: Record<string, any>
			tenantId?: string
			organizationId?: string
		}
	) {
		const { role, command, k, filter } = options ?? {}
		const tenantId = options?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = options?.organizationId ?? RequestContext.getOrganizationId()
		const vectorStore = await this.getVectorStore(tenantId, organizationId, role)

		if (vectorStore) {
			return await vectorStore.vectorStore.maxMarginalRelevanceSearch(
				query,
				{
					...(options ?? {})
				} as MaxMarginalRelevanceSearchOptions<Record<string, any>>,
				undefined
			)
		}
		return null
	}

	override async create(partialEntity: Partial<ICopilotKnowledge>, ...options: any[]): Promise<CopilotKnowledge> {
		const entity = await super.create(partialEntity, ...options)

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		// Update to vector store
		const vectorStore = await this.getVectorStore(tenantId, organizationId, entity.role)
		if (vectorStore) {
			await vectorStore.updateExamples([entity])
			super.update(entity.id, { provider: vectorStore.provider, vector: true })
		}

		return entity
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<CopilotKnowledge>,
		...options: any[]
	): Promise<UpdateResult | CopilotKnowledge> {
		await super.update(id, partialEntity)
		const entity = await this.findOneByIdString(id)

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		// Update to vector store
		const vectorStore = await this.getVectorStore(tenantId, organizationId, entity.role)
		if (vectorStore) {
			await vectorStore.updateExamples([entity])
			super.update(entity.id, { provider: vectorStore.provider, vector: true })
		}

		return entity
	}

	override async delete(criteria: string, options?: FindOneOptions<CopilotKnowledge>): Promise<DeleteResult> {
		const entity = await this.findOne(criteria, options)
		const result = await super.delete(criteria, options)

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		// Delete example from vector store
		const vectorStore = await this.getVectorStore(tenantId, organizationId, entity.role)
		if (vectorStore) {
			await vectorStore.deleteExample(entity)
		}

		return result
	}

	/**
	 * Create embeddings for tenant and organization
	 *
	 * @param tenantId
	 * @param organizationId
	 * @returns
	 */
	private async getEmbeddings(copilot: ICopilot) {
		if (copilot) {
			return await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, null, {tokenCallback: (token) => {
					// execution.tokens += (token ?? 0)
				}})
			)
		}
		return null
	}

	async getVectorStore(tenantId: string, organizationId: string, role: AiBusinessRole | string) {
		const id = (organizationId || tenantId) + `:${role || 'default'}`

		let collectionName = id
		const copilot = await this.copilotService.findCopilot(tenantId, organizationId, AiProviderRole.Embedding)
		if (copilot) {
			if (!copilot.organizationId) {
				collectionName = tenantId + `:${role || 'default'}`
			}
		} else {
			throw new Error('No embedding copilot found')
		}

		if (!this.vectorStores.has(id) || !isEqual(this.vectorStores.get(id).copilot.updatedAt, copilot.updatedAt)) {

			this.#logger.verbose(`Found embedding model for (tenantId: ${tenantId}, organizationId: ${organizationId}, role: ${role}):`, JSON.stringify(pick(copilot,  'role', 'provider', 'defaultModel'), null, 2))
			
			const embeddings = await this.getEmbeddings(copilot)

			if (embeddings) {
				const vectorStore = new PGMemberVectorStore(copilot, embeddings, {
					pool: this.pgPool,
					tableName: 'copilot_knowledge_vector',
					collectionTableName: 'copilot_knowledge_collection',
					collectionName,
					columns: {
						idColumnName: 'id',
						vectorColumnName: 'vector',
						contentColumnName: 'content',
						metadataColumnName: 'metadata'
					}
				})

				await vectorStore.ensureTableInDatabase()

				this.vectorStores.set(id, vectorStore)
				return this.vectorStores.get(id)
			}

			this.#logger.error(`Can't get copilot for (tenantId= ${tenantId}, organizationId= ${organizationId})`)

			return null
		}

		return this.vectorStores.get(id)
	}

	async getCommands(options?: FindManyOptions<CopilotKnowledge>) {
		const condition = this.findOneWithTenant(options)
		return this.repository
			.createQueryBuilder('knowledge')
			.select('knowledge.command')
			.distinctOn(['knowledge.command'])
			.where(condition?.where)
			.getMany()
	}

	async createBulk(
		entities: ICopilotKnowledge[],
		roles: IXpert[],
		options: { createRole: boolean; clearRole: boolean }
	) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const { createRole, clearRole } = options || {}
		const roleNames = uniq(entities.map((example) => example.role))

		if (roles) {
			for await (const role of roles) {
				try {
					await this.commandBus.execute(new XpertCreateCommand({...role, type: XpertTypeEnum.Copilot}))
				} catch (error) {}
			}
		}

		// Auto create role if not existed
		if (createRole) {
			for await (const role of compact(roleNames).filter((role) => !roles.find((r) => r.name === role))) {
				try {
					await this.commandBus.execute(new XpertCreateCommand({ name: role, type: XpertTypeEnum.Copilot }))
				} catch (error) {}
			}
		}

		const results = []

		// Add examples to vector store
		for (const role of roleNames) {
			const vectorStore = await this.getVectorStore(tenantId, organizationId, role ? role : null)
			if (clearRole) {
				const { items } = await this.findAll({ where: { role: role } })
				await vectorStore?.vectorStore.delete({ filter: { role: role } })
				await this.repository.remove(items)
			}

			const examples = entities
				.filter((item) => (role ? item.role === role : !item.role))
				.map((example) => ({
					...example,
					input: example.input ? `${example.input}`.trim() : null,
					output: example.output ? `${example.output}`.trim() : null
				}))
				.filter((item) => !!item.command && !!item.input)
			const roleExamples = await Promise.all(examples.map((entity) => super.create(entity)))
			results.push(...roleExamples)
			if (roleExamples.length && vectorStore) {
				await vectorStore.addExamples(roleExamples)
				await Promise.all(
					roleExamples.map((entity) =>
						super.update(entity.id, { provider: vectorStore.provider, vector: true })
					)
				)
			}
		}

		return results
	}
}

class PGMemberVectorStore {
	vectorStore: PGVectorStore

	get provider() {
		return this.copilot.modelProvider?.providerName
	}

	constructor(
		public copilot: ICopilot,
		public embeddings: EmbeddingsInterface,
		_dbConfig: PGVectorStoreArgs
	) {
		this.vectorStore = new PGVectorStore(embeddings, _dbConfig)
	}

	async addExamples(examples: ICopilotKnowledge[]): Promise<void> {
		if (!examples.length) return

		const documents = examples.map(
			(example) =>
				new Document({
					metadata: {
						id: example.id,
						role: example.role,
						command: example.command,
						input: example.input,
						output: example.output,
						provider: this.provider,
						model: this.copilot.defaultModel
					},
					pageContent: example.input
				})
		)

		return await this.vectorStore.addDocuments(documents, {
			ids: examples.map((example) => example.id)
		})
	}

	async updateExamples(examples: ICopilotKnowledge[]): Promise<void> {
		// Delete old example vectors
		await this.vectorStore.delete({ ids: examples.map((example) => example.id) })

		// Add new example vectors
		await this.addExamples(examples)
	}

	async deleteExample(example: ICopilotKnowledge) {
		return await this.vectorStore.delete({ ids: [example.id] })
	}

	async clear() {
		return await this.vectorStore.delete({ filter: {} })
	}

	/**
	 * Create table for vector store if not exist
	 */
	async ensureTableInDatabase() {
		await this.vectorStore.ensureTableInDatabase()
		await this.vectorStore.ensureCollectionTableInDatabase()
	}
}
