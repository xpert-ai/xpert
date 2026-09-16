import { IPagination } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, Repository } from 'typeorm'
import { RequestContext, TenantOrganizationAwareCrudService } from '../core'
import { Tag } from './tag.entity'

@Injectable()
export class TagService extends TenantOrganizationAwareCrudService<Tag> {
	constructor(
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>
	) {
		super(tagRepository)
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
		const tenantId = RequestContext.currentTenantId()
		const categories = this.tagRepository
			.createQueryBuilder('tag')
			.select('DISTINCT tag.category')
			.where('tag.tenantId = :tenantId', { tenantId })
			.andWhere('(tag.organizationId = :organizationId OR tag.organizationId IS NULL)', { organizationId })
			.getRawMany()
		return categories
	}
}
