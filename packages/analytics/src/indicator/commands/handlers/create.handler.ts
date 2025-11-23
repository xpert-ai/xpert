import { RequestContext, TagService } from '@metad/server-core'
import { HttpException, HttpStatus } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { assign } from 'lodash'
import { Not } from 'typeorm'
import { Indicator } from '../../indicator.entity'
import { IndicatorService } from '../../indicator.service'
import { IndicatorCreateCommand } from '../create.command'

@CommandHandler(IndicatorCreateCommand)
export class IndicatorCreateHandler implements ICommandHandler<IndicatorCreateCommand> {
	constructor(private readonly indicatorService: IndicatorService, private readonly tagService: TagService) {}

	public async execute(command: IndicatorCreateCommand): Promise<Indicator> {
		const indicator = command.input

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const result = await (indicator.id
			? this.indicatorService.findOneOrFailByOptions({
					where: {
						tenantId,
						modelId: indicator.modelId,
						entity: indicator.entity,
						code: indicator.code,
						id: Not(indicator.id)
					}
			  })
			: this.indicatorService.findOneOrFailByOptions({
					where: {
						tenantId,
						modelId: indicator.modelId,
						entity: indicator.entity,
						code: indicator.code
					}
			  }))

		if (result.success) {
			throw new HttpException(`Indicator code '${indicator.code}' already exists`, HttpStatus.BAD_REQUEST)
		}

		// Associate with existing tags
		if (indicator.tags) {
			for await (const tag of indicator.tags) {
				if (!tag.id) {
					try {
						const _tag = await this.tagService.findOne({
							where: {
								tenantId,
								organizationId,
								name: tag.name,
								category: tag.category
							}
						})

						if (_tag) {
							assign(tag, _tag)
						}
					} catch (err) {
						//
					}
				}
			}
		}

		return this.indicatorService.create(indicator)
	}
}
