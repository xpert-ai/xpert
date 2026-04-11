import { BusinessAreaRole } from '@xpert-ai/contracts'
import { CrudController, RequestContext, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'
import { BusinessAreaCreateCommand } from './commands'
import { BusinessAreaMyCommand } from './commands/business-area.my.command'
import { BusinessAreaDTO } from './dto/business-area.dto'

@ApiTags('BusinessArea')
@ApiBearerAuth()
@Controller()
export class BusinessAreaController extends CrudController<BusinessArea> {
	constructor(private readonly bgService: BusinessAreaService, private readonly commandBus: CommandBus) {
		super(bgService)
	}

	// 通常情况下是所有人都能浏览所有的业务域列表， 便于查找数字资源
	// @UseGuards(PermissionGuard)
	// @Permissions(AnalyticsPermissionsEnum.BUSINESS_GROUP_EDIT)
	@Get()
	async findAll() {
		return this.bgService.findAll()
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Post()
	async create(@Body() group): Promise<BusinessArea> {
		return this.commandBus.execute(
			new BusinessAreaCreateCommand({
				name: group.name,
				parentId: group.parentId
			})
		)
	}

	@Get('my')
	async my(@Query('role') role: BusinessAreaRole): Promise<BusinessAreaDTO[]> {
		const user = RequestContext.currentUser()
		return this.commandBus.execute(new BusinessAreaMyCommand(user, role))
	}

	@Get(':id/me')
	async getMe(@Param('id', UUIDValidationPipe) id: string) {
		return await this.bgService.getMeInBusinessArea(id)
	}
}
