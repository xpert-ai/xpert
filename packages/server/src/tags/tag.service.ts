import { IPagination } from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TenantOrganizationAwareCrudService } from '../core'
import { Tag } from './tag.entity'

@Injectable()
export class TagService extends TenantOrganizationAwareCrudService<Tag> {
	constructor(
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>
	) {
		super(tagRepository)
	}

	async findCatalog(): Promise<IPagination<Tag>> {
		const tenantId = this.catalogTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const shared = { tenantId, organizationId: IsNull() }
		const items = await this.tagRepository.find({
			where: organizationId ? [{ tenantId, organizationId }, shared] : shared,
			select: {
				id: true,
				tenantId: true,
				organizationId: true,
				name: true,
				label: true,
				description: true,
				category: true,
				targets: true,
				color: true,
				icon: true,
				isActive: true,
				isSystem: true
			},
			loadEagerRelations: false,
			order: { name: 'ASC', id: 'ASC' }
		})
		return { items, total: items.length }
	}

	private catalogTenantId() {
		const user = RequestContext.currentUser()
		if (!user?.id || !user.tenantId || user.isActive === false) throw new ForbiddenException()
		return user.tenantId
	}

	/**
	 * Find all tag in org and tenant
	 * @param filter
	 * @returns
	 */
	public async findAll(filter?: FindManyOptions<Tag>): Promise<IPagination<Tag>> {
		const organizationId = RequestContext.getOrganizationId()
		const tenantTags = await super.findAllWithoutOrganization(filter)
		if (organizationId) {
			const orgTags = await super.findAll(filter)
			return {
				total: tenantTags.total + orgTags.total,
				items: [...orgTags.items, ...tenantTags.items]
			}
		}
		return tenantTags
	}

	async findAllCategories(): Promise<{ category: string }[]> {
		const organizationId = RequestContext.getOrganizationId()
		const tenantId = this.catalogTenantId()
		const categories = this.tagRepository
			.createQueryBuilder('tag')
			.select('DISTINCT tag.category')
			.where('tag.tenantId = :tenantId', { tenantId })
			.andWhere('(tag.organizationId = :organizationId OR tag.organizationId IS NULL)', { organizationId })
			.getRawMany()
		return categories
	}
}
