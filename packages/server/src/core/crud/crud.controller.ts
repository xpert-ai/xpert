import {
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	HttpStatus,
	HttpCode,
	Query,
	UsePipes
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IPagination } from '@metad/contracts';
import { DeepPartial, FindOptionsWhere } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseEntity } from '../entities/internal';
import { ICrudService } from './icrud.service';
import { OptionsSelect, PaginationParams } from './pagination-params';
import { AbstractValidationPipe, ParseJsonPipe, UUIDValidationPipe } from './../../shared/pipes';
import { isNil, omitBy } from 'lodash';
import { TenantOrganizationBaseDTO } from '../dto';
import { transformWhere } from './transform-where';

@ApiResponse({ 
	status: HttpStatus.UNAUTHORIZED,
	description: 'Unauthorized'
})
@ApiResponse({
	status: HttpStatus.FORBIDDEN,
	description: 'Forbidden'
})
@ApiBearerAuth()
export abstract class CrudController<T extends BaseEntity> {
	protected constructor(private readonly crudService: ICrudService<T>) {}
	
	/**
	 * Get the total count of all records.
	 *
	 * This endpoint retrieves the total count of all records for the given entity.
	 *
	 * @param options Optional query options for filtering records.
	 * @returns A promise resolving to the count of all records.
	 */
	@ApiOperation({ summary: 'Get total record count' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Total record count retrieved successfully'
	})
	@Get('count')
	async getCount(@Query() options?: FindOptionsWhere<T>): Promise<number | void> {
		return await this.crudService.countBy(options);
	}

	@ApiOperation({ summary: 'Find all records using pagination' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get('pagination')
	async pagination(
		filter?: PaginationParams<T>,
		...options: any[]
	): Promise<IPagination<T> | void> {
		return this.crudService.paginate(filter);
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get()
	async findAll(
		filter: PaginationParams<T>,
		@Query('$where', ParseJsonPipe) where?: PaginationParams<T>['where'],
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<T>['relations'],
		@Query('$order', ParseJsonPipe) order?: PaginationParams<T>['order'],
		@Query('$take') take?: PaginationParams<T>['take'],
		@Query('$skip') skip?: PaginationParams<T>['skip'],
		@Query('$select', ParseJsonPipe) select?: OptionsSelect<T>['select'],
		...options: any[]
	): Promise<IPagination<T>> {
		return this.crudService.findAll(omitBy({
			where: transformWhere(where ?? filter?.where),
			relations: relations ?? filter?.relations,
			order: order ?? filter?.order,
			take: take ?? filter?.take,
			skip: skip ?? filter?.skip,
			select: select,
			...(filter ?? {}),
		}, isNil));
	}

	@ApiOperation({ summary: 'find my all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found my records'
	})
	@Get('my')
	async findMyAll(@Query('data', ParseJsonPipe) params: PaginationParams<T>,): Promise<IPagination<T>> {
		return this.crudService.findMyAll(params);
	}
	
	@ApiOperation({ summary: 'Find by id' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<T>['relations'],
		...options: any[]
	): Promise<T> {
		return this.crudService.findOne(id, { relations });
	}

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
		@Body() entity: DeepPartial<T>,
		...options: any[]
	): Promise<T> {
		return this.crudService.create(entity);
	}

	@ApiOperation({ summary: 'Update an existing record' })
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
		@Body() entity: QueryDeepPartialEntity<T>,
		...options: any[]
	): Promise<any> {
		return this.crudService.update(id, entity); // FIXME: https://github.com/typeorm/typeorm/issues/1544
	}

	@ApiOperation({ summary: 'Delete record' })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The record has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) id: string, 
		...options: any[]
	): Promise<any> {
		return this.crudService.delete(id);
	}

	/**
	 * Soft deletes a record by ID.
	 *
	 * This endpoint marks a record as deleted without physically removing it from the database.
	 * The soft-deleted record can be restored later.
	 *
	 * @param id The ID of the record to soft delete.
	 * @returns The soft-deleted record.
	 */
	@ApiOperation({ summary: 'Soft delete a record by ID' })
	@ApiResponse({
		status: HttpStatus.ACCEPTED,
		description: 'Record soft deleted successfully'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Delete(':id/soft')
	@HttpCode(HttpStatus.ACCEPTED)
	@UsePipes(new AbstractValidationPipe({ whitelist: true }, { query: TenantOrganizationBaseDTO }))
	async softRemove(@Param('id', UUIDValidationPipe) id: T['id'], ...options: any[]): Promise<T> {
		// Soft delete the record
		return await this.crudService.softRemove(id, options);
	}

	/**
	 * Restores a soft-deleted record by ID.
	 *
	 * This endpoint restores a record that was previously soft-deleted,
	 * allowing it to be used again in the application.
	 *
	 * @param id The ID of the record to restore.
	 * @returns The restored record.
	 */
	@ApiOperation({ summary: 'Restore a soft-deleted record by ID' })
	@ApiResponse({
		status: HttpStatus.ACCEPTED,
		description: 'Record restored successfully'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found or not in a soft-deleted state'
	})
	@Put(':id/recover')
	@HttpCode(HttpStatus.ACCEPTED)
	@UsePipes(new AbstractValidationPipe({ whitelist: true }, { query: TenantOrganizationBaseDTO }))
	async softRecover(@Param('id', UUIDValidationPipe) id: T['id'], ...options: any[]): Promise<T> {
		// Restore the soft-deleted record
		return await this.crudService.softRecover(id, options);
	}
}
