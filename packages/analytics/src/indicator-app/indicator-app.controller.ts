import { IIndicatorApp, IPagination } from '@metad/contracts'
import { CrudController, ParseJsonPipe } from '@metad/server-core'
import { Controller, Get, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FindManyOptions } from 'typeorm'
import { IndicatorApp } from './indicator-app.entity'
import { IndicatorAppService } from './indicator-app.service'

@ApiTags('IndicatorApp')
@ApiBearerAuth()
@Controller()
export class IndicatorAppController extends CrudController<IndicatorApp> {
	constructor(
		private readonly service: IndicatorAppService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Get('me')
	async my(@Query('$query', ParseJsonPipe) data: FindManyOptions): Promise<IPagination<IIndicatorApp>> {
		const { relations, where } = data
		return await this.service.my({
			where,
			relations
		})
	}
}
