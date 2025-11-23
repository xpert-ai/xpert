import { IndicatorStatusEnum, IPagination, TIndicatorDraft } from '@metad/contracts';
import { CrudController, PaginationParams, ParseJsonPipe, transformWhere, UUIDValidationPipe } from '@metad/server-core';
import { Body, ClassSerializerInterceptor, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
	ApiTags,
	ApiBearerAuth,
	ApiOperation,
	ApiResponse
} from '@nestjs/swagger';
import { FindOneOptions, FindManyOptions, ObjectLiteral, DeepPartial } from 'typeorm'
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

	@UseInterceptors(ClassSerializerInterceptor)
	@Get()
	async findAllPublic(
		@Query('data', ParseJsonPipe) params: PaginationParams<Indicator>,
	): Promise<IPagination<IndicatorPublicDTO>> {
		const where = transformWhere(params.where ?? {})

		return await this.indicatorService.findAll({
			...(params ?? {}),
			where,
		}).then((result) => ({
			...result,
			items: result.items.map((item) => new IndicatorPublicDTO(item))
		}))
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('view')
	async findAllView(
		@Query('$query', ParseJsonPipe) data: FindManyOptions
	): Promise<IPagination<IndicatorPublicDTO>> {
		const { relations, where } = data ?? {};
		return await this.indicatorService.findAll({
			where: {
				...((where ?? {}) as ObjectLiteral),
				status: IndicatorStatusEnum.RELEASED,
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
	 * Query your own indicators: the ones you created and have permission to edit
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
	 * Query your own indicators application indicators
	 * 
	 * @param options 
	 * @returns 
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('app')
	async app(@Query('$query', ParseJsonPipe) options?: FindManyOptions<Indicator>) {
		return this.queryBus.execute(new IndicatorMyQuery({...options, where: {status: IndicatorStatusEnum.RELEASED, visible: true, isApplication: true}}))
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

	/**
	 * Batch creation of indicator drafts.
	 * 
	 * @param indicators 
	 * @returns 
	 */
	@HttpCode(HttpStatus.CREATED)
	@Post('bulk')
	async createBulk(@Body() indicators: Indicator[]) {
		return this.indicatorService.createBulk(indicators)
	}

	@Get(':id')
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<Indicator>['relations'],
		@Query('$query', ParseJsonPipe) options: FindOneOptions<Indicator>,
	): Promise<Indicator> {
		return this.indicatorService.findOneByIdString(id, {relations, ...options});
	}

	@Put(':id/draft')
	async updateDraft(@Param('id', UUIDValidationPipe) id: string, @Body() draft: TIndicatorDraft) {
		return this.indicatorService.updateDraft(id, draft)
	}

	@Post(':id/publish')
	async publish(@Param('id', UUIDValidationPipe) id: string) {
		return this.indicatorService.publish(id)
	}

	@Post(':id/embedding')
	async embedding(@Param('id', UUIDValidationPipe) id: string) {
		return this.indicatorService.embedding(id)
	}

	@Delete(':id')
	async deleteById(@Param('id', UUIDValidationPipe) id: string,): Promise<void> {
		await this.indicatorService.deleteById(id)
	}
}
