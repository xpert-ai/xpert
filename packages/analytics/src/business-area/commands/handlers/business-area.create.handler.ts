import { BusinessAreaRole } from '@xpert-ai/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BusinessAreaUserService } from '../../../business-area-user/index'
import { BusinessArea } from '../../business-area.entity'
import { BusinessAreaService } from '../../business-area.service'
import { BusinessAreaCreateCommand } from '../business-area.create.command'

/**
 * 1. Create business group
 * 2. Add me to the business group
 */
@CommandHandler(BusinessAreaCreateCommand)
export class BusinessAreaCreateHandler implements ICommandHandler<BusinessAreaCreateCommand> {
	constructor(
		private readonly businessArea: BusinessAreaService,
		private readonly bauService: BusinessAreaUserService
	) {}

	public async execute(command: BusinessAreaCreateCommand): Promise<BusinessArea> {
		let area: BusinessArea = { ...command.input } as BusinessArea
		if (command.input.parentId) {
			const parent = await this.businessArea.findOne(command.input.parentId)
			area.parent = parent
		}

		area = await this.businessArea.create(area)

		await this.bauService.create({ userId: area.createdById, businessAreaId: area.id, role: BusinessAreaRole.Adminer })
		return area
	}
}
