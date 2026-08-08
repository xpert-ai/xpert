import { RolesEnum } from '@xpert-ai/contracts'
import { CrudController } from '../core/crud'
import { RoleGuard } from '../shared/guards'
import { Roles } from '../shared/decorators'
import { Controller, Post, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DataSourceType } from './data-source-type.entity'
import { DataSourceTypeService } from './data-source-type.service'

@ApiTags('DataSourceType')
@ApiBearerAuth()
@Controller()
export class DataSourceTypeController extends CrudController<DataSourceType> {
	constructor(
		private readonly service: DataSourceTypeService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	@Post('sync')
	async syncDataSourceTypes() {
		await this.service.sync()
	}
}
