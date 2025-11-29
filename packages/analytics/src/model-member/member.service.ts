import { Document } from '@langchain/core/documents'
import { ISemanticModel } from '@metad/contracts'
import { DATABASE_POOL_TOKEN, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Pool } from 'pg'
import { DeepPartial, FindOptionsWhere, FindManyOptions, In, Repository } from 'typeorm'
import { SemanticModelMember } from './member.entity'
import { CreateVectorStoreCommand } from './commands/create-vector-store.command'

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
		// try {
		// 	await this.bulkDelete(model.id, cube, {})
		// } catch (err) {
		// 	//
		// }

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
				...((query.where as FindOptionsWhere<SemanticModelMember>) ?? {}),
				modelId,
				cube
			}
		})
		return await this.delete({ id: In(members.map((item) => item.id)) })
	}

	/**
	 * @deprecated use command
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
		// Instantiate vector store with embeddings
		const id = options.modelId ? `${options.modelId}${options.cube ? ':' + options.cube : ''}` + (options.isDraft ? ':draft' : '') : 'default'
		const {vectorStore} = await this.commandBus.execute(new CreateVectorStoreCommand(id))
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
}
