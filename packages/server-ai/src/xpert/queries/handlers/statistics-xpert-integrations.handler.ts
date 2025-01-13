import { Integration, RequestContext } from '@metad/server-core'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { StatisticsXpertIntegrationsQuery } from '../statistics-xpert-integrations.query'

@QueryHandler(StatisticsXpertIntegrationsQuery)
export class StatisticsXpertIntegrationsHandler implements IQueryHandler<StatisticsXpertIntegrationsQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: StatisticsXpertIntegrationsQuery) {
		const { start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = getRepository(Integration)

		const query = repository
			.createQueryBuilder('integration')
			.select('COUNT(DISTINCT integration.id) AS count')
			.where('integration.tenantId = :tenantId', { tenantId })
			.andWhere('integration.organizationId = :organizationId', { organizationId })
			.andWhere(`integration.options->>'xpertId' IS NOT NULL`)

		if (start) {
			query.andWhere('integration.createdAt >= :start', { start })
		}
		if (end) {
			query.andWhere('integration.createdAt <= :end', { end })
		}

		return await query.getRawMany()
	}
}
