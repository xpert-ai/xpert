import { AnalyticsPermissionsEnum, BusinessAreaRole, IBusinessAreaUser } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BusinessAreaUserService } from '../../../business-area-user/index'
import { BusinessArea } from '../../business-area.entity'
import { BusinessAreaService } from '../../business-area.service'
import { BusinessAreaDTO } from '../../dto/business-area.dto'
import { BusinessAreaMyCommand } from '../business-area.my.command'

@CommandHandler(BusinessAreaMyCommand)
export class BusinessAreaMyHandler implements ICommandHandler<BusinessAreaMyCommand, BusinessAreaDTO[]> {
	constructor(
		private readonly businessArea: BusinessAreaService,
		private readonly bauService: BusinessAreaUserService
	) {}

	public async execute(command: BusinessAreaMyCommand): Promise<BusinessAreaDTO[]> {
		// Admin manage business areas
		if (RequestContext.hasPermission(AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT)) {
			return this.businessArea.findAll().then((result)=> result.items.map((item) => new BusinessAreaDTO(item)))
		}

		// Users
		const user = command.input
		const where: Partial<IBusinessAreaUser> = { user }
		if (BusinessAreaRole[command.role]) {
			where.role = command.role
		}
		const { items: businessAreaUsers } = await this.bauService.findAll({
			where,
			relations: ['businessArea']
		})

		const myBusinessAreas = []
		for (const bau of businessAreaUsers) {
			const businessAreas = await this.businessArea.findDescendants(bau.businessArea as BusinessArea)
			businessAreas.forEach((area) => {
				if (myBusinessAreas.findIndex((item) => item.id === area.id) === -1) {
					myBusinessAreas.push(new BusinessAreaDTO(area, bau.role))
				}
			})
		}

		return myBusinessAreas
	}
}
