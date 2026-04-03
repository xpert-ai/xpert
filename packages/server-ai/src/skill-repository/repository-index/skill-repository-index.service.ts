import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { omit } from 'lodash'
import { In, Repository } from 'typeorm'
import { SkillRepositoryService } from '../skill-repository.service'
import { SkillRepositoryIndex } from './skill-repository-index.entity'

@Injectable()
export class SkillRepositoryIndexService extends TenantOrganizationAwareCrudService<SkillRepositoryIndex> {
	readonly #logger = new Logger(SkillRepositoryIndexService.name)

	@Inject(SkillSourceProviderRegistry)
	private readonly skillSourceProviderRegistry: SkillSourceProviderRegistry

	constructor(
		@InjectRepository(SkillRepositoryIndex)
		repository: Repository<SkillRepositoryIndex>,
		readonly skillRepositoryService: SkillRepositoryService
	) {
		super(repository)
	}

	/**
	 * Synchronize skill index records for a repository.
	 * Existing entries are updated, new ones are created, and removed ones are soft-deleted.
	 */
	async sync(repositoryId: string, options: { mode: 'full' | 'incremental' }) {
		if (!repositoryId) {
			throw new BadRequestException('repositoryId is required to sync skill repository indexes.')
		}
		const repository = await this.skillRepositoryService.findOneByIdString(repositoryId)

		const existing = await this.repository.find({
			where: {
				repositoryId
			}
		})

		const strategy = this.skillSourceProviderRegistry.get(repository.provider)
		const items: Partial<SkillRepositoryIndex>[] = await strategy.listSkills(repository)

		try {
			const toSave = items.map((item) => {
				const matched = existing.find((record) => record.skillId === item.skillId)
				return {
					...(matched ?? {}),
					...omit(item, 'repository'),
					repositoryId
				}
			})

			const saved = await Promise.all(toSave.map((item) => this.create(item)))
			if (options.mode === 'full') {
				const keepIds = new Set(saved.filter((it) => it.id).map((it) => it.id))
				const toDelete = existing.filter((item) => !keepIds.has(item.id)).map((item) => item.id)
				if (toDelete.length) {
					await this.repository.softDelete({ id: In(toDelete) })
				}
			}

			return saved
		} catch (error) {
			this.#logger.error(`Sync skill repository index failed for ${repositoryId}`, error as Error)
			throw new BadRequestException(getErrorMessage(error))
		} finally {
			await this.skillRepositoryService.updateLastSyncAt(repositoryId)
		}
	}
}
