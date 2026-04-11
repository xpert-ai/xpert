import {
	PermissionsEnum,
	IPagination,
	IApprovalPolicy,
	IListQueryInput,
	IPermissionApprovalFindInput,
} from '@xpert-ai/contracts';
import {
	Query,
	HttpStatus,
	UseGuards,
	Get,
	Post,
	Body,
	HttpCode,
	Put,
	Param,
	Controller,
	ValidationPipe
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { ApprovalPolicy } from './approval-policy.entity';
import { ApprovalPolicyService } from './approval-policy.service';
import {
	ApprovalPolicyCreateCommand,
	ApprovalPolicyGetCommand,
	ApprovalPolicyUpdateCommand,
	PermissionApprovalPolicyGetCommand,
} from './commands';
import { CreateApprovalPolicyDTO, UpdateApprovalPolicyDTO } from './dto';
import { PermissionGuard, TenantPermissionGuard, Permissions, CrudController, ParseJsonPipe, PaginationParams, UUIDValidationPipe } from '@xpert-ai/server-core';

@ApiTags('ApprovalPolicy')
@UseGuards(TenantPermissionGuard, PermissionGuard)
@Permissions(PermissionsEnum.APPROVAL_POLICY_EDIT)
@Controller()
export class ApprovalPolicyController extends CrudController<ApprovalPolicy> {
	constructor(
		private readonly approvalPolicyService: ApprovalPolicyService,
		private readonly commandBus: CommandBus
	) {
		super(approvalPolicyService);
	}

	/**
	 * GET all approval policies except time off and equipment sharing policy
	 *
	 * @param data
	 * @returns
	 */
	@ApiOperation({
		summary:
			'Find all approval policies except time off and equipment sharing policy.'
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found policies',
		type: ApprovalPolicy
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Permissions(PermissionsEnum.APPROVAL_POLICY_VIEW)
	@HttpCode(HttpStatus.ACCEPTED)
	@Get('request-approval')
	async findApprovalPoliciesForPermissionApproval(
		@Query('data', ParseJsonPipe)
		data: IListQueryInput<IPermissionApprovalFindInput>
	): Promise<IPagination<IApprovalPolicy>> {
		return await this.commandBus.execute(
			new PermissionApprovalPolicyGetCommand(data)
		);
	}

	/**
	 * GET approval policies by pagination
	 *
	 * @param options
	 * @returns
	 */
	@Permissions(PermissionsEnum.APPROVAL_POLICY_VIEW)
	@Get('pagination')
	async pagination(
		@Query(new ValidationPipe()) options: PaginationParams<ApprovalPolicy>
	): Promise<IPagination<ApprovalPolicy>> {
		return this.approvalPolicyService.pagination(options);
	}

	/**
	 * GET all approval policies
	 *
	 * @param data
	 * @returns
	 */
	@ApiOperation({ summary: 'Find all approval policies.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found policies',
		type: ApprovalPolicy
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Permissions(PermissionsEnum.APPROVAL_POLICY_VIEW)
	@HttpCode(HttpStatus.ACCEPTED)
	@Get()
	async findAll(
		@Query(new ValidationPipe()) options: PaginationParams<ApprovalPolicy>
	): Promise<IPagination<ApprovalPolicy>> {
		return await this.commandBus.execute(
			new ApprovalPolicyGetCommand(options)
		);
	}

	/**
	 * CREATE approval policy
	 *
	 * @param entity
	 * @returns
	 */
	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(
		@Body(new ValidationPipe({
			whitelist: true
		})) entity: CreateApprovalPolicyDTO
	): Promise<ApprovalPolicy> {
		return await this.commandBus.execute(
			new ApprovalPolicyCreateCommand(entity)
		);
	}

	/**
	 * UPDATE approval policy by id
	 *
	 * @param id
	 * @param entity
	 * @returns
	 */
	@ApiOperation({ summary: 'Update record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully edited.'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body(new ValidationPipe({
			whitelist: true
		})) entity: UpdateApprovalPolicyDTO
	): Promise<IApprovalPolicy> {
		return await this.commandBus.execute(
			new ApprovalPolicyUpdateCommand(id, entity)
		);
	}
}