import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { omit } from 'lodash'
import { Brackets, FindManyOptions, In, Repository } from 'typeorm'
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

const isObjectValue = (value: unknown): value is object =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const readStringFilter = (where: unknown, key: string) => {
	if (!isObjectValue(where)) {
		return undefined
	}

	const value = Reflect.get(where, key)
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const readStringArrayFilter = (where: unknown, key: string) => {
	if (!isObjectValue(where)) {
		return undefined
	}

	const value = Reflect.get(where, key)
	if (Array.isArray(value)) {
		const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		return items.length ? items : undefined
	}

	if (!isObjectValue(value)) {
		return undefined
	}

	const inValue = Reflect.get(value, '$in')
	if (!Array.isArray(inValue)) {
		return undefined
	}

	const items = inValue.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
	return items.length ? items : undefined
}

const normalizeOrderDirection = (value: unknown): 'ASC' | 'DESC' =>
	value === 'ASC' ? 'ASC' : 'DESC'

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

	async findMarketplace(options?: FindManyOptions<SkillRepositoryIndex>, search?: string) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const trimmedSearch = search?.trim()
		const query = this.repository
			.createQueryBuilder('skill')
			.leftJoinAndSelect('skill.repository', 'repository')
			.where('skill.tenantId = :tenantId', { tenantId })
			.andWhere('skill.deletedAt IS NULL')

		if (organizationId) {
			query.andWhere(new Brackets((qb) => {
				qb.where('skill.organizationId = :organizationId', { organizationId })
					.orWhere('skill.organizationId IS NULL')
			}))
		} else {
			query.andWhere('skill.organizationId IS NULL')
		}

		const repositoryId = readStringFilter(options?.where, 'repositoryId')
		const repositoryIds = readStringArrayFilter(options?.where, 'repositoryId')
		const skillId = readStringFilter(options?.where, 'skillId')

		if (repositoryId) {
			query.andWhere('skill.repositoryId = :repositoryId', { repositoryId })
		} else if (repositoryIds?.length) {
			query.andWhere('skill.repositoryId IN (:...repositoryIds)', { repositoryIds })
		}

		if (skillId) {
			query.andWhere('skill.skillId = :skillId', { skillId })
		}

		if (trimmedSearch) {
			query.andWhere(new Brackets((qb) => {
				qb.where('skill.name ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('skill.skillId ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('skill.skillPath ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(skill.description, \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(skill.tags::text, \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(skill.author::jsonb ->> \'handle\', \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(skill.author::jsonb ->> \'displayName\', \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(skill.author::jsonb ->> \'name\', \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
					.orWhere('COALESCE(repository.name, \'\') ILIKE :search', { search: `%${trimmedSearch}%` })
			}))
		}

		const order = options?.order
		if (order && typeof order === 'object') {
			let applied = false
			for (const [field, direction] of Object.entries(order)) {
				switch (field) {
					case 'name':
					case 'skillId':
					case 'skillPath':
					case 'createdAt':
					case 'updatedAt':
						query.addOrderBy(`skill.${field}`, normalizeOrderDirection(direction))
						applied = true
						break
				}
			}

			if (!applied) {
				query.orderBy('skill.updatedAt', 'DESC')
			}
		} else {
			query.orderBy('skill.updatedAt', 'DESC')
		}

		if (typeof options?.skip === 'number') {
			query.skip(options.skip)
		}

		if (typeof options?.take === 'number') {
			query.take(options.take)
		}

		const [items, total] = await query.getManyAndCount()
		return {
			items: items.map((item) => ({
				...item,
				repository: this.skillRepositoryService.localizeRepository(item.repository)
			})),
			total
		}
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
