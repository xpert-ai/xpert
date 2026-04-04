import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { omit } from 'lodash'
import { In, Repository } from 'typeorm'
import { SkillRepositoryService } from '../skill-repository.service'
import { SkillRepositoryIndex } from './skill-repository-index.entity'

type SyncSkillRepositoryIndex = Partial<SkillRepositoryIndex> & Pick<SkillRepositoryIndex, 'skillId'>

const buildSkillRepositoryIndexKey = (repositoryId: string, skillId: string) => `${repositoryId}:${skillId}`

const getTimestamp = (value?: Date | string | null) => {
	if (!value) {
		return 0
	}

	const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
	return Number.isNaN(timestamp) ? 0 : timestamp
}

const compareSkillRepositoryIndexFreshness = (left: SkillRepositoryIndex, right: SkillRepositoryIndex) =>
	getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt) ||
	getTimestamp(right.createdAt) - getTimestamp(left.createdAt)

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
	 * How to check uniqueness: repositoryId + skillId
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
		const existingBySkillKey = new Map<string, SkillRepositoryIndex>()
		const duplicateExistingIds: string[] = []
		for (const record of [...existing].sort(compareSkillRepositoryIndexFreshness)) {
			const key = buildSkillRepositoryIndexKey(repositoryId, record.skillId)
			if (existingBySkillKey.has(key)) {
				if (record.id) {
					duplicateExistingIds.push(record.id)
				}
				continue
			}

			existingBySkillKey.set(key, record)
		}

		const strategy = this.skillSourceProviderRegistry.get(repository.provider)

		try {
			const items: Partial<SkillRepositoryIndex>[] = await strategy.listSkills(repository)
			const incomingBySkillKey = new Map<string, SyncSkillRepositoryIndex>()
			for (const item of items) {
				if (!item.skillId) {
					throw new BadRequestException('Skill repository index item.skillId is required.')
				}

				const key = buildSkillRepositoryIndexKey(repositoryId, item.skillId)
				incomingBySkillKey.set(key, item as SyncSkillRepositoryIndex)
			}

			if (items.length > incomingBySkillKey.size) {
				this.#logger.warn(
					`Repository ${repositoryId} sync returned ${items.length - incomingBySkillKey.size} duplicate skill indexes; deduplicating by repositoryId + skillId`
				)
			}

			if (duplicateExistingIds.length) {
				this.#logger.warn(
					`Repository ${repositoryId} has ${duplicateExistingIds.length} duplicated skill index rows; cleaning extras during sync`
				)
			}

			const toSave = Array.from(incomingBySkillKey.values()).map((item) => {
				const matched = existingBySkillKey.get(buildSkillRepositoryIndexKey(repositoryId, item.skillId))
				return {
					...(matched ?? {}),
					...omit(item, 'repository'),
					repositoryId
				}
			})

			const saved = await Promise.all(toSave.map((item) => this.create(item)))
			const toDeleteIds = new Set(duplicateExistingIds)

			if (options.mode === 'full') {
				const keepIds = new Set(saved.map((item) => item.id))
				existing
					.filter((item) => item.id && !keepIds.has(item.id))
					.forEach((item) => {
						if (item.id) {
							toDeleteIds.add(item.id)
						}
					})
			}

			if (toDeleteIds.size) {
				await this.repository.softDelete({ id: In(Array.from(toDeleteIds)) })
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
