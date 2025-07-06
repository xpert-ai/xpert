import { Body, ClassSerializerInterceptor, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CrudController, PaginationParams, ParseJsonPipe, transformWhere, UUIDValidationPipe } from '@metad/server-core';
import {
	ApiTags,
	ApiBearerAuth,
	ApiOperation,
	ApiResponse
} from '@nestjs/swagger';
import { FindOneOptions, FindManyOptions, ObjectLiteral, DeepPartial } from 'typeorm'
import { IPagination } from '@metad/contracts';
import { Indicator } from './indicator.entity';
import { IndicatorService } from './indicator.service';
import { IndicatorPublicDTO } from './dto';
import { IndicatorMyQuery } from './queries';
import { IndicatorCreateCommand } from './commands';

@ApiTags('Indicator')
@ApiBearerAuth()
@Controller()
export class IndicatorController extends CrudController<Indicator> {
    constructor(
		private readonly indicatorService: IndicatorService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {
		super(indicatorService);
	}

	/**
	 * Tenant 内账号查询公开指标 ?
	 * 
	 * @param data 
	 * @returns 
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get()
	async findAllPublic(
		@Query('$query', ParseJsonPipe) data: FindManyOptions
	): Promise<IPagination<IndicatorPublicDTO>> {
		const { relations, where } = data;
		return await this.indicatorService.findAll({
			where: {
				...((where ?? {}) as ObjectLiteral),
				isActive: true,
				visible: true,
				// visibility: Visibility.Public
			},
			relations
		}).then((result) => ({
			...result,
			items: result.items.map((item) => new IndicatorPublicDTO(item))
		}))
	}

	/**
	 * 查询属于自己的指标: 自己创建和有权限编辑的
	 * 
	 * @param options 
	 * @returns 
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('my')
	async my(@Query('$query', ParseJsonPipe) options?: FindManyOptions<Indicator>) {
		return this.queryBus.execute(new IndicatorMyQuery(options))
	}

	/**
	 * Query all indicators belong to the project
	 * 
	 * @param options 
	 * @returns 
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('project/:id')
	async byProject(@Param('id', UUIDValidationPipe) id: string, @Query('data', ParseJsonPipe) options?: PaginationParams<Indicator>) {
		const { relations, select } = options ?? {}
		const where = transformWhere(options?.where ?? {})
		// Check the project permission
		// todo
		return await this.indicatorService.findAll({
			select,
			relations,
			where: {...where, projectId: id}
		})
	}

	@Post('project/:id/embedding')
	async startEmbedding(@Param('id') id: string, @Body() body: { ids: string[] }) {
		await this.indicatorService.startEmbedding(id)
	}

	/**
	 * 查询属于自己的指标应用指标
	 * 
	 * @param options 
	 * @returns 
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('app')
	async app(@Query('$query', ParseJsonPipe) options?: FindManyOptions<Indicator>) {
		return this.queryBus.execute(new IndicatorMyQuery({...options, where: {isActive: true, visible: true, isApplication: true}}))
	}

	@Get('count')
	async getCount(): Promise<number | void> {
	  return await this.indicatorService.countMy()
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
		@Body() entity: DeepPartial<Indicator>,
	): Promise<Indicator> {
		return await this.commandBus.execute(new IndicatorCreateCommand(entity))
	}

	@Post('bulk')
	async createBulk(@Body() indicators: Indicator[]) {
		return this.indicatorService.createBulk(indicators)
	}

	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<Indicator>['relations'],
		@Query('$query', ParseJsonPipe) options: FindOneOptions<Indicator>
	): Promise<Indicator> {
		return this.indicatorService.findOne(id, {relations, ...options});
	}

	@Delete(':id')
	async deleteById(@Param('id', UUIDValidationPipe) id: string,): Promise<void> {
		await this.indicatorService.deleteById(id)
	}
}
