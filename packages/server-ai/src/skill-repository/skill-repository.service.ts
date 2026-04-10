import {
	WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME,
	WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { FindOptionsWhere, Repository } from 'typeorm'
import { SkillRepository } from './skill-repository.entity'

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

		return this.create({
			name: WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME,
			provider: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
		})
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
}
