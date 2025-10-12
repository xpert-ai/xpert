import { Controller, Get, HttpStatus, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrudController, ITryRequest } from './../core/crud'
import { TransformInterceptor } from './../core/interceptors'
import { TenantPermissionGuard } from './../shared/guards'
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes'
import { Employee } from './employee.entity'
import { EmployeeService } from './employee.service'

@ApiTags('Employee')
@UseInterceptors(TransformInterceptor)
@Controller()
export class EmployeeController extends CrudController<Employee> {
	constructor(
		private readonly employeeService: EmployeeService,
		private readonly commandBus: CommandBus
	) {
		super(employeeService)
	}

	/**
	 * GET employee by user id in the same tenant
	 *
	 * @param userId
	 * @param data
	 * @returns
	 */
	@ApiOperation({ summary: 'Find employee by user id in the same tenant.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found employee in the same tenant',
		type: Employee
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('/user/:userId')
	@UseGuards(TenantPermissionGuard)
	async findByUserId(
		@Param('userId', UUIDValidationPipe) userId: string,
		@Query('data', ParseJsonPipe) data?: any
	): Promise<ITryRequest> {
		const { relations = [] } = data
		const { success, record, error } = await this.employeeService.findOneOrFailByOptions({
			where: {
				userId
			},
			relations
		})
		if (success) {
			return { success, record }
		} else {
			return { success, record: null }
		}
	}
}
