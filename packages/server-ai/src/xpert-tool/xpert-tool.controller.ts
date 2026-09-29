import { IXpertTool } from '@xpert-ai/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	TransformInterceptor,
	UUIDValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Logger, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { XpertTool } from './xpert-tool.entity'
import { XpertToolService } from './xpert-tool.service'

@ApiTags('XpertTool')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertToolController extends CrudController<XpertTool> {
	readonly #logger = new Logger(XpertToolController.name)
	constructor(
		private readonly service: XpertToolService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Post('test')
	async test(@Body() body: Partial<IXpertTool>) {
		return await this.service.testTool(body)
	}

	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<XpertTool>['relations']
	): Promise<XpertTool> {
		return this.service.getTool(id, { relations })
	}

	@Get(':id/faker')
	// [local-patch 2026-09-25] 显式返回类型规避 TS2742（hoisted 下 type-fest 版本共存）
	async paramsFaker(
		@Param('id', UUIDValidationPipe) id: string,
	): Promise<unknown> {
		return this.service.getParamsFaker(id)
	}
}
