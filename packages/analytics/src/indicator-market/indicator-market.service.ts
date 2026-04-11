import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { IndicatorMarket } from './indicator-market.entity'

@Injectable()
export class IndicatorMarketService extends TenantOrganizationAwareCrudService<IndicatorMarket> {
	constructor(
		@InjectRepository(IndicatorMarket)
		imRepository: Repository<IndicatorMarket>
	) {
		super(imRepository)
	}
}
