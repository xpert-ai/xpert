import { IXpertProject } from '@metad/contracts'
import { CrudController, PaginationParams, ParseJsonPipe, TransformInterceptor } from '@metad/server-core'
import { Controller, Delete, Get, Logger, Param, Put, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { XpertProject } from './project.entity'
import { XpertProjectService } from './project.service'

@ApiTags('XpertProject')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertProjectController extends CrudController<XpertProject> {
	readonly #logger = new Logger(XpertProjectController.name)
	constructor(
		private readonly service: XpertProjectService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Get(':id/xperts')
	async getXperts(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertProject>) {
		return this.service.getXperts(id, params)
	}

	@Put(':id/xperts/:xpert')
	async updateXperts(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.addXpert(id, xpertId)
	}

	@Delete(':id/xperts/:xpert')
	async removeXpert(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.removeXpert(id, xpertId)
	}
}
