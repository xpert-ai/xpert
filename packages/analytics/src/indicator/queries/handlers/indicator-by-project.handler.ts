import { RequestContext } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, ObjectLiteral, Repository } from 'typeorm'
import { Indicator } from '../../indicator.entity'
import { IndicatorsByProjectQuery } from '../indicator-by-project.query'

@QueryHandler(IndicatorsByProjectQuery)
export class IndicatorsByProjectHandler implements IQueryHandler<IndicatorsByProjectQuery> {
	private readonly logger = new Logger(IndicatorsByProjectHandler.name)
	constructor(
		@InjectRepository(Indicator)
		private indicatorRepository: Repository<Indicator>
	) {}

	async execute(query: IndicatorsByProjectQuery) {
		const { projectId, options } = query
		const relations = options?.relations
		const where = <ObjectLiteral>options?.where ?? {}

		const me = RequestContext.currentUser()
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const [items, total] = await this.indicatorRepository.findAndCount({
			relations,
			where: projectId
				? {
						...where,
						tenantId,
						organizationId,
						projectId
				  }
				: {
						...where,
						tenantId,
						organizationId,
						projectId: IsNull(),
						createdById: me.id
				  }
		})

		return {
			items,
			total
		}
	}
}
