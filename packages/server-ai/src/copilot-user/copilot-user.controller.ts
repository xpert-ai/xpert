import {
	AIPermissionsEnum,
	ICopilotUser,
	ICopilotUserUsageGroupKey,
	ICopilotUserUsageSummary,
	IPagination,
	TCopilotUserUsageSummaryRenewInput
} from '@xpert-ai/contracts'
import {
	CrudController,
	OrganizationPublicDTO,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	TransformInterceptor,
	UserPublicDTO,
	UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Logger, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
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

	constructor(readonly service: CopilotUserService) {
		super(service)
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Get('summary')
	@UseValidationPipe()
	async getSummary(
		@Query('$order', ParseJsonPipe) order: PaginationParams<CopilotUser>['order'],
		@Query('$take') take: PaginationParams<CopilotUser>['take'],
		@Query('$skip') skip: PaginationParams<CopilotUser>['skip']
	): Promise<IPagination<ICopilotUserUsageSummary>> {
		const result = await this.service.findUserUsageSummaries({ order, take, skip })
		return {
			...result,
			items: result.items.map((item) => this.toPublicSummary(item))
		}
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
		@Query('$skip') skip: PaginationParams<CopilotUser>['skip']
	): Promise<IPagination<PublicCopilotUserDto>> {
		const result = await this.service.findAll({ where, relations, order, take, skip })
		return {
			...result,
			items: result.items.map((_) => new PublicCopilotUserDto(_))
		}
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post('summary/details')
	async getSummaryDetails(@Body() entity: ICopilotUserUsageGroupKey) {
		return (await this.service.findUserUsageDetails(entity)).map((detail) => new PublicCopilotUserDto(detail))
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post('summary/renew')
	async renewSummary(@Body() entity: TCopilotUserUsageSummaryRenewInput) {
		return this.toPublicSummary(await this.service.renewUserUsageSummary(entity))
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post(':id/renew')
	async renew(@Param('id') id: string, @Body() entity: Partial<ICopilotUser>) {
		return await this.service.renew(id, entity)
	}

	private toPublicSummary(item: ICopilotUserUsageSummary): ICopilotUserUsageSummary {
		return {
			...item,
			user: item.user ? (new UserPublicDTO(item.user) as ICopilotUser['user']) : undefined,
			org: item.org ? (new OrganizationPublicDTO(item.org) as ICopilotUser['org']) : undefined,
			details: item.details?.map((detail) => new PublicCopilotUserDto(detail) as ICopilotUser)
		}
	}
}
