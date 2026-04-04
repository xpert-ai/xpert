import {
	Controller,
	HttpStatus,
	Get,
	Query,
	UseGuards,
	HttpCode,
	Delete,
	Param,
	Req,
	UseInterceptors,
	Post,
	Body,
	BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CrudController } from './../core/crud';
import { IUserOrganization, IUserOrganizationCreateInput, RolesEnum, LanguagesEnum, IPagination } from '@metad/contracts';
import { UserOrganizationService } from './user-organization.services';
import { UserOrganization } from './user-organization.entity';
import { Not } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { UserOrganizationDeleteCommand } from './commands';
import { I18nLang } from 'nestjs-i18n';
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes';
import { TenantPermissionGuard } from './../shared/guards';
import { TransformInterceptor } from './../core/interceptors';
import { UserService } from '../user/user.service';

@ApiTags('UserOrganization')
@UseGuards(TenantPermissionGuard)
@UseInterceptors(TransformInterceptor)
@Controller()
export class UserOrganizationController extends CrudController<UserOrganization> {
	constructor(
		private readonly userOrganizationService: UserOrganizationService,
		private readonly commandBus: CommandBus,
		private readonly userService: UserService
	) {
		super(userOrganizationService);
	}

	@ApiOperation({ summary: 'Create a user organization membership' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The membership has been successfully created.'
	})
	@Post()
	@HttpCode(HttpStatus.CREATED)
	override async create(@Body() entity: IUserOrganizationCreateInput): Promise<IUserOrganization> {
		if (!entity?.userId || !entity?.organizationId) {
			throw new BadRequestException('Both userId and organizationId are required')
		}

		const user = await this.userService.findOne(entity.userId, { relations: ['role'] })
		const created = await this.userOrganizationService.addUserToOrganization(user, entity.organizationId)
		const membership = Array.isArray(created)
			? created.find(({ organizationId }) => organizationId === entity.organizationId)
			: created

		if (!membership) {
			throw new BadRequestException(`Unable to resolve membership for organization '${entity.organizationId}'`)
		}

		const patch: Partial<IUserOrganization> = {}
		if (typeof entity.isActive === 'boolean' && membership.isActive !== entity.isActive) {
			patch.isActive = entity.isActive
		}
		if (typeof entity.isDefault === 'boolean' && membership.isDefault !== entity.isDefault) {
			patch.isDefault = entity.isDefault
		}

		if (Object.keys(patch).length) {
			await this.userOrganizationService.update(membership.id, patch)
			return this.userOrganizationService.findOne(membership.id)
		}

		return membership
	}

	@ApiOperation({ summary: 'Find all UserOrganizations.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found UserOrganizations',
		type: UserOrganization
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get()
	async findAll(
		@Query('data', ParseJsonPipe) data: any
	): Promise<IPagination<UserOrganization>> {
		const { relations, findInput } = data;
		return this.userOrganizationService.findAll({
			where: findInput,
			relations
		});
	}

	@ApiOperation({ summary: 'Delete user from organization' })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The user has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) id: string,
		@Req() request,
		@I18nLang() language: LanguagesEnum
	): Promise<IUserOrganization> {
		return this.commandBus.execute(
			new UserOrganizationDeleteCommand({
				userOrganizationId: id,
				requestingUser: request.user,
				language
			})
		);
	}

	@ApiOperation({ summary: 'Find number of Organizations user belongs to' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Count of Organizations given user belongs to',
		type: Number
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get(':id')
	async findOrganizationCount(
		@Param('id', UUIDValidationPipe) id: string
	): Promise<number> {
		const { userId } = await this.findById(id);
		const { total } = await this.userOrganizationService.findAll({
			where: {
				userId,
				isActive: true,
				user: {
					role: { name: Not(RolesEnum.EMPLOYEE) }
				}
			},
			relations: ['user', 'user.role']
		});
		return total;
	}

	// This was not being used and it overrides the default unnecessarily, so removed until required.
	// Please do not user Get() for findOne and use something like @Get(/organization/id)
	// @ApiOperation({ summary: 'Find one from the search input' })
	// @ApiResponse({ status: HttpStatus.OK, description: 'Found user organization', type: UserOrganization })
	// @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Record not found' })
	// @Get()
	// async findOne(@Query('findInputStr') findInputStr: string): Promise<IUserOrganization> {
	//     const findInput = JSON.parse(findInputStr);
	//     return this.userOrganizationService.findOne({ where: findInput });
	// }
}
