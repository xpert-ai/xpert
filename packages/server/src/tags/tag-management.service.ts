import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	getTagTargets,
	ITagDirectoryItem,
	ITagUsage,
	PermissionsEnum,
	TAG_TARGETS,
	TagCategoryEnum,
	TagTarget
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { EntityManager, IsNull, Repository } from 'typeorm'
import { z } from 'zod'
import { RequestContext } from '../core/context'
import { Tag } from './tag.entity'

const inputSchema = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	description: z.string().max(500).nullable().optional(),
	label: z
		.object({ en_US: z.string().max(100), zh_Hans: z.string().max(100).optional() })
		.nullable()
		.optional(),
	category: z.nativeEnum(TagCategoryEnum).nullable().optional(),
	targets: z
		.array(z.custom<TagTarget>((value) => TAG_TARGETS.some((target) => target === value)))
		.min(1)
		.max(TAG_TARGETS.length)
		.optional(),
	color: z.string().max(2000).nullable().optional(),
	icon: z.string().max(10000).nullable().optional(),
	isActive: z.boolean().optional()
})

const usageTargets: Partial<Record<string, TagTarget>> = {
	prompt_workflow: 'prompt_workflow',
	xpert: TagCategoryEnum.XPERT,
	xpert_toolset: TagCategoryEnum.TOOLSET,
	employee: 'people',
	user: 'people',
	organization: 'people',
	organization_contact: 'people',
	integration: 'integration'
}

@Injectable()
export class TagManagementService {
	constructor(@InjectRepository(Tag) private readonly repository: Repository<Tag>) {}

	private scope() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) throw new ForbiddenException()
		return { tenantId, organizationId: RequestContext.getOrganizationId() ?? IsNull() }
	}

	private canEdit(tag: Tag) {
		return (
			RequestContext.hasPermission(PermissionsEnum.ORG_TAGS_EDIT) &&
			!tag.isSystem &&
			(tag.organizationId ?? null) === (RequestContext.getOrganizationId() ?? null)
		)
	}

	async directory(): Promise<ITagDirectoryItem[]> {
		const scope = this.scope()
		const tags = await this.repository.find({
			where: [scope, { tenantId: scope.tenantId, organizationId: IsNull() }],
			order: { name: 'ASC', id: 'ASC' }
		})
		const usage = await this.usage(
			this.repository.manager,
			tags.map((tag) => tag.id),
			true
		)
		return tags.map((tag) => ({
			...tag,
			targets: getTagTargets(tag),
			editable: this.canEdit(tag),
			usage: usage.get(tag.id) ?? []
		}))
	}

	// Read actual junction metadata, including relationships owned by server-ai entities.
	// Return counts only: catalog access does not grant access to private resource names.
	private async usage(manager: EntityManager, ids: string[], currentOrganization: boolean) {
		const result = new Map<string, ITagUsage[]>()
		if (!ids.length) return result
		const seen = new Set<string>()
		for (const metadata of manager.connection.entityMetadatas) {
			for (const relation of metadata.relations) {
				if (!relation.isManyToMany || !relation.isOwning || !relation.junctionEntityMetadata) continue
				const ownsTag = metadata.target === Tag
				if (!ownsTag && relation.inverseEntityMetadata.target !== Tag) continue
				const junction = relation.junctionEntityMetadata
				if (seen.has(junction.tablePath)) continue
				seen.add(junction.tablePath)
				const resource = ownsTag ? relation.inverseEntityMetadata : metadata
				const target = usageTargets[resource.tableName]
				if (!target)
					throw new BadRequestException(
						t('server-ai:Error.TagUsageUnsupported', {
							defaultValue: 'Cannot safely inspect this tag relationship.'
						})
					)
				const tagColumn = (ownsTag ? relation.joinColumns : relation.inverseJoinColumns)[0]
				const resourceColumn = (ownsTag ? relation.inverseJoinColumns : relation.joinColumns)[0]
				const escape = (name: string) => manager.connection.driver.escape(name)
				const tagId = `link.${escape(tagColumn.databaseName)}`
				const query = manager
					.createQueryBuilder()
					.from(resource.target, 'resource')
					.withDeleted()
					.innerJoin(
						junction.tablePath,
						'link',
						`link.${escape(resourceColumn.databaseName)} = resource.${escape(resource.primaryColumns[0].databaseName)}`
					)
					.select(tagId, 'tagId')
					.addSelect('COUNT(*)', 'count')
					.where(`${tagId} IN (:...ids)`, { ids })
					.groupBy(tagId)
				if (resource.findColumnWithPropertyName('tenantId'))
					query.andWhere('resource.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
				if (currentOrganization && RequestContext.getOrganizationId()) {
					if (resource.tableName === 'organization')
						query.andWhere('resource.id = :organizationId', {
							organizationId: RequestContext.getOrganizationId()
						})
					else if (resource.findColumnWithPropertyName('organizationId'))
						query.andWhere('resource.organizationId = :organizationId', {
							organizationId: RequestContext.getOrganizationId()
						})
				}
				const counts = await query.getRawMany<{ tagId: string; count: string }>()
				for (const row of counts) {
					const entries = result.get(row.tagId) ?? []
					const entry = entries.find((item) => item.target === target)
					if (entry) entry.count += Number(row.count)
					else entries.push({ target, count: Number(row.count) })
					result.set(row.tagId, entries)
				}
			}
		}
		// Explicit knowledge associations carry provenance, so they are entities rather than ManyToMany junctions.
		for (const metadata of manager.connection.entityMetadatas) {
			if (!['knowledgebase_tag', 'knowledge_document_tag'].includes(metadata.tableName)) continue
			const query = manager
				.createQueryBuilder()
				.from(metadata.target, 'link')
				.select('link.tagId', 'tagId')
				.addSelect('COUNT(*)', 'count')
				.where('link.tagId IN (:...ids)', { ids })
				.andWhere('link.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
				.groupBy('link.tagId')
			if (currentOrganization && RequestContext.getOrganizationId()) {
				query.andWhere('link.organizationId = :organizationId', {
					organizationId: RequestContext.getOrganizationId()
				})
			}
			const counts = await query.getRawMany<{ tagId: string; count: string }>()
			for (const row of counts) {
				const entries = result.get(row.tagId) ?? []
				const entry = entries.find((item) => item.target === 'knowledgebase')
				if (entry) entry.count += Number(row.count)
				else entries.push({ target: 'knowledgebase', count: Number(row.count) })
				result.set(row.tagId, entries)
			}
		}

		return result
	}

	async write(input: unknown, id?: string): Promise<Tag> {
		const scope = this.scope()
		if (!RequestContext.hasPermission(PermissionsEnum.ORG_TAGS_EDIT)) throw new ForbiddenException()
		const parsed = inputSchema.safeParse(input)
		if (!parsed.success)
			throw new BadRequestException(t('server-ai:Error.InvalidTagInput', { defaultValue: 'Invalid tag fields.' }))
		return this.repository.manager.transaction(async (manager) => {
			// Serialize catalog writes within the tenant, including duplicate-name checks.
			const tenant = await manager.getRepository('Tenant').findOne({
				where: { id: scope.tenantId },
				lock: { mode: 'pessimistic_write' }
			})
			if (!tenant) throw new ForbiddenException()
			const repository = manager.getRepository(Tag)
			const existing = id
				? await repository.findOne({ where: { ...scope, id }, lock: { mode: 'pessimistic_write' } })
				: null
			if (id && !existing) throw new NotFoundException()
			if (existing && !this.canEdit(existing)) throw new ForbiddenException()
			const changes = parsed.data
			if (changes.targets) changes.targets = [...new Set(changes.targets)]
			// Old clients can still write category; new clients write the complete target set.
			if (changes.category !== undefined && !changes.targets)
				changes.targets = changes.category ? [changes.category] : undefined
			const tag = repository.create({
				...existing,
				...changes,
				tenantId: scope.tenantId,
				organizationId: RequestContext.getOrganizationId() ?? null,
				updatedById: RequestContext.currentUserId(),
				...(!id ? { createdById: RequestContext.currentUserId(), isSystem: false } : {})
			})
			if (!tag.name?.trim())
				throw new BadRequestException(
					t('server-ai:Error.InvalidTagInput', { defaultValue: 'Invalid tag fields.' })
				)
			if (changes.targets)
				tag.category =
					changes.targets.find((target): target is TagCategoryEnum =>
						Object.values(TagCategoryEnum).some((category) => category === target)
					) ?? null
			if (changes.name !== undefined || !id) {
				const duplicate = await repository
					.createQueryBuilder('tag')
					.where('tag.tenantId = :tenantId', { tenantId: scope.tenantId })
					.andWhere(
						RequestContext.getOrganizationId()
							? 'tag.organizationId = :organizationId'
							: 'tag.organizationId IS NULL',
						{ organizationId: RequestContext.getOrganizationId() }
					)
					.andWhere('LOWER(tag.name) = LOWER(:name)', { name: tag.name })
					.getMany()
				if (duplicate.some((item) => item.id !== id))
					throw new BadRequestException(
						t('server-ai:Error.TagNameExists', {
							defaultValue: 'A tag with this name already exists in this scope.'
						})
					)
			}
			if (existing && changes.targets) {
				const usage = (await this.usage(manager, [id], false)).get(id) ?? []
				const removed = getTagTargets(existing).filter((target) => !changes.targets.includes(target))
				if (usage.some((item) => removed.includes(item.target) && item.count))
					throw new BadRequestException(
						t('server-ai:Error.TagTargetInUse', {
							defaultValue: 'A target still uses this tag and cannot be removed.'
						})
					)
			}
			return repository.save(tag)
		})
	}

	async remove(id: string) {
		const scope = this.scope()
		if (!RequestContext.hasPermission(PermissionsEnum.ORG_TAGS_EDIT)) throw new ForbiddenException()
		return this.repository.manager.transaction(async (manager) => {
			const repository = manager.getRepository(Tag)
			const tag = await repository.findOne({ where: { ...scope, id }, lock: { mode: 'pessimistic_write' } })
			if (!tag) throw new NotFoundException()
			if (!this.canEdit(tag)) throw new ForbiddenException()
			const usage = (await this.usage(manager, [id], false)).get(id) ?? []
			if (usage.some((item) => item.count))
				throw new BadRequestException(
					t('server-ai:Error.TagInUse', {
						defaultValue: 'This tag is in use. Disable it instead of deleting it.'
					})
				)
			return repository.delete({ ...scope, id })
		})
	}
}
