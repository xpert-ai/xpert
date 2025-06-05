import { AIPermissionsEnum, ICopilotUser, IPagination } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	TransformInterceptor,
	UseValidationPipe
} from '@metad/server-core'
import { Body, Controller, Get, Logger, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotUser } from './copilot-user.entity'
import { CopilotUserService } from './copilot-user.service'
import { PublicCopilotUserDto } from './dto/public-copilot-user'

@ApiTags('CopilotUser')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotUserController extends CrudController<CopilotUser> {
	readonly #logger = new Logger(CopilotUserController.name)
	constructor(
		readonly service: CopilotUserService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Get()
	@UseValidationPipe()
	async getAll(
		@Query('$filter', ParseJsonPipe) where: PaginationParams<CopilotUser>['where'],
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<CopilotUser>['relations'],
		@Query('$order', ParseJsonPipe) order: PaginationParams<CopilotUser>['order'],
		@Query('$take') take: PaginationParams<CopilotUser>['take'],
		@Query('$skip') skip: PaginationParams<CopilotUser>['skip'],
	): Promise<IPagination<PublicCopilotUserDto>> {
		const result = await this.service.findAll({ where, relations, order, take, skip })
		return {
			...result,
			items: result.items.map((_) => new PublicCopilotUserDto(_))
		}
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post(':id/renew')
	async renew(@Param('id') id: string, @Body() entity: Partial<ICopilotUser>) {
		return await this.service.renew(id, entity)
	}
}
