import { IPagination } from '@xpert-ai/contracts'
import { RequestContext, TenantAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, FindManyOptions, Repository } from 'typeorm'
import { StoryTemplate } from './story-template.entity'
import { StoryTemplatePublicDTO } from './dto'

@Injectable()
export class StoryTemplateService extends TenantAwareCrudService<StoryTemplate> {
	private readonly logger = new Logger(StoryTemplateService.name)

	constructor(
		@InjectRepository(StoryTemplate)
		storyTemplateRepository: Repository<StoryTemplate>,
		readonly commandBus: CommandBus
	) {
		super(storyTemplateRepository)
	}

	/**
	 * 创建时加上 organizationId， 其他操作只通过 id 进行
	 * 
	 * @param entity 
	 * @param options 
	 * @returns 
	 */
	public async create(entity: DeepPartial<StoryTemplate>, ...options: any[]): Promise<StoryTemplate> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		if (organizationId) {
			entity = {
				...entity,
				organization: { id: organizationId },
			}
		}

		if (tenantId) {
			const entityWithTenant = {
				...entity,
				tenant: { id: tenantId },
			}
			return super.create(entityWithTenant, ...options)
		}
		return super.create(entity, ...options)
	}

	/**
	 * @deprecated
	 * 
	 * @param criteria 
	 * @returns 
	 */
	public async findAllTemplates(criteria?: FindManyOptions<StoryTemplate>): Promise<IPagination<StoryTemplatePublicDTO>> {
		const { where } = criteria ?? {}
		const tenantId = RequestContext.currentTenantId()
		// get All storyTemplates sort by count stories in story template
		const queryBuilder = this.repository
			.createQueryBuilder('storyTemplate')
			.leftJoin('storyTemplate.stories', 'story')
			.leftJoin('storyTemplate.preview', 'preview')
			.leftJoin('storyTemplate.createdBy', 'createdBy')
			.leftJoin('storyTemplate.tags', 'tags')
			.select('storyTemplate')
			.addSelect('createdBy')
			.addSelect('preview.url', 'previewUrl')
			.addSelect('preview.url', 'previewUrl')
			.addSelect('COUNT(story.id)', 'storyCount')
			.where('storyTemplate.tenantId = :tenantId', { tenantId })
			.andWhere(where ?? {})
			.groupBy('storyTemplate.id')
			.addGroupBy('createdBy.id')
			.addGroupBy('preview.url')
			.orderBy(`"storyCount"`, 'DESC')
			.addOrderBy('storyTemplate.createdAt', 'DESC')
			
		const items = await queryBuilder.getRawMany()

		this.logger.debug(queryBuilder.getSql())

		return {
			total: items.length,
			items: items.map((item) => new StoryTemplatePublicDTO(item))
		}
	}
}
