import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
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

		try {
			if (entity.id) {
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
		return this.skillSourceProviderRegistry.list().map((strategy) => strategy.meta)
	}

	updateLastSyncAt(repositoryId: string) {
		return this.repository.update(repositoryId, {
			lastSyncAt: new Date()
		})
	}
}
