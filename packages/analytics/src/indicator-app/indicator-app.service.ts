import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, Repository } from 'typeorm'
import { IndicatorApp } from './indicator-app.entity'

@Injectable()
export class IndicatorAppService extends TenantOrganizationAwareCrudService<IndicatorApp> {
	constructor(
		@InjectRepository(IndicatorApp)
		iappRepository: Repository<IndicatorApp>
	) {
		super(iappRepository)
	}

	my(options?: FindManyOptions<IndicatorApp>) {
		const where = options?.where ?? ({} as any)
		return this.findAll({
			...(options || {}),
			where: {
				...where,
				createdById: RequestContext.currentUserId()
			}
		})
	}
}
