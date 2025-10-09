import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { FindOneOptions, FindOptionsRelationByString, Repository } from 'typeorm'
import { StoryWidget } from './story-widget.entity'
import { BusinessArea, BusinessAreaService } from '../business-area'
import { StoryWidgetPublicDTO } from './dto'
import { Visibility } from '@metad/contracts'

@Injectable()
export class StoryWidgetService extends TenantOrganizationAwareCrudService<StoryWidget> {
	constructor(
		@InjectRepository(StoryWidget)
		widgetRepository: Repository<StoryWidget>,
		private businessAreaService: BusinessAreaService
	) {
		super(widgetRepository)
	}

	async findPublicOne(id: string, options: FindOneOptions) {
		const relations = options?.relations as FindOptionsRelationByString
		const widget = await this.repository.findOne({
			relations: ['point', 'point.story', ...(relations ?? [])],
			where: {
				id,
				point: {
					story: {
						visibility: Visibility.Public
					}
				}
			}
		})

		if (!widget) {
			throw new NotFoundException()
		}

		return new StoryWidgetPublicDTO(widget)
	}

	protected async checkUpdateAuthorization(id: string | number) {
		const userId = RequestContext.currentUserId()
		const storyPoint = await this.findOne(id, { relations: ['story', 'story.businessArea'] })

		if (storyPoint?.story?.businessArea) {
			const businessAreaUser = await this.businessAreaService.getAccess(storyPoint.story.businessArea as BusinessArea)
			if (businessAreaUser?.role > 1) {
				throw new UnauthorizedException('Access reject')
			}
		} else if (storyPoint.createdById !== userId) {
			throw new UnauthorizedException('Not yours')
		}

	}
}
