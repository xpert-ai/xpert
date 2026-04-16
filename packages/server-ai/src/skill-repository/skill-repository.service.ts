import {
	WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME,
	WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm'
import { translate } from '../shared/translate'
import { SkillRepository } from './skill-repository.entity'

type SkillRepositoryPage = {
	items: SkillRepository[]
	total: number
}

@Injectable()
export class SkillRepositoryService extends TenantOrganizationAwareCrudService<SkillRepository> {
	readonly #logger = new Logger(SkillRepositoryService.name)

	@Inject(SkillSourceProviderRegistry)
	private readonly skillSourceProviderRegistry: SkillSourceProviderRegistry

	constructor(
		@InjectRepository(SkillRepository)
		repository: Repository<SkillRepository>
	) {
		super(repository)
	}

	override async findAll(filter?: FindManyOptions<SkillRepository>): Promise<SkillRepositoryPage> {
		return this.localizeRepositoryPage(await super.findAll(filter))
	}

	override async findAllInOrganizationOrTenant(options?: FindManyOptions<SkillRepository>): Promise<SkillRepositoryPage> {
		return this.localizeRepositoryPage(await super.findAllInOrganizationOrTenant(options))
	}

	override async findOneByIdString(id: string, options?: FindOneOptions<SkillRepository>): Promise<SkillRepository> {
		return this.localizeRepository(await super.findOneByIdString(id, options))
	}

	override async findOneInOrganizationOrTenant(id: string, options?: FindOneOptions<SkillRepository>): Promise<SkillRepository> {
		return this.localizeRepository(await super.findOneInOrganizationOrTenant(id, options))
	}

	/**
	 * Register or update a skill repository entry.
	 */
	async register(entity: SkillRepository) {
		if (!entity?.name || !entity?.provider) {
			throw new BadRequestException('Repository name and provider are required.')
		}
		if (entity.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER) {
			throw new BadRequestException('System managed repositories cannot be registered manually.')
		}

		try {
			if (entity.id) {
				await this.assertMutableRepository(entity.id)
				await this.update(entity.id, entity)
				return this.findOneByIdString(entity.id)
			}

			return this.create(entity)
		} catch (error) {
			this.#logger.error(`Failed to register skill repository ${entity?.name}`, error as Error)
			throw new BadRequestException(getErrorMessage(error))
		}
	}
	
	getSourceStrategies() {
		return this.skillSourceProviderRegistry
			.list()
			.filter((strategy) => strategy.meta.name !== WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER)
			.map((strategy) => strategy.meta)
	}

	updateLastSyncAt(repositoryId: string) {
		return this.repository.update(repositoryId, {
			lastSyncAt: new Date()
		})
	}

	async ensureWorkspacePublicRepository() {
		const where: FindOptionsWhere<SkillRepository> = {
			provider: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
		}
		const { items } = await this.findAll({
			where,
			take: 1
		})
		const existing = items[0]
		if (existing) {
			return existing
		}

		return this.localizeRepository(await this.create({
			name: this.getWorkspacePublicRepositoryName(),
			provider: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
		}))
	}

	async deleteRepository(id: string) {
		await this.assertMutableRepository(id)
		return this.delete(id)
	}

	async updateRepository(id: string, entity: Partial<SkillRepository>) {
		await this.assertMutableRepository(id)
		await this.update(id, entity)
		return this.findOneByIdString(id)
	}

	private async assertMutableRepository(id: string) {
		const repository = await this.findOneByIdString(id)
		if (repository.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER) {
			throw new BadRequestException('System managed repositories cannot be modified manually.')
		}
	}

	localizeRepository(repository: SkillRepository): SkillRepository
	localizeRepository(repository?: SkillRepository | null): SkillRepository | null | undefined
	localizeRepository(repository?: SkillRepository | null): SkillRepository | null | undefined {
		if (!repository || repository.provider !== WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER) {
			return repository
		}

		return {
			...repository,
			name: this.getWorkspacePublicRepositoryName()
		}
	}

	private localizeRepositoryPage(result: SkillRepositoryPage): SkillRepositoryPage {
		return {
			...result,
			items: result.items.map((item) => this.localizeRepository(item))
		}
	}

	private getWorkspacePublicRepositoryName() {
		const label = this.skillSourceProviderRegistry
			.list()
			.find((strategy) => strategy.type === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER)
			?.meta?.label

		return translate(label ?? WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME)
	}
}
