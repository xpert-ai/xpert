import { Controller } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CrudController } from '@xpert-ai/server-core'
import { IndicatorMarket } from './indicator-market.entity'
import { IndicatorMarketService } from './indicator-market.service'

@ApiTags('IndicatorMarket')
@ApiBearerAuth()
@Controller()
export class IndicatorMarketController extends CrudController<IndicatorMarket> {
	constructor(
		private readonly imService: IndicatorMarketService,
		private readonly commandBus: CommandBus
	) {
		super(imService)
	}

	
}
