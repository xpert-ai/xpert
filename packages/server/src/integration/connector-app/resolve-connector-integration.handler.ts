import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ResolveConnectorIntegrationQuery } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { Integration } from '../integration.entity'

@QueryHandler(ResolveConnectorIntegrationQuery)
export class ResolveConnectorIntegrationHandler implements IQueryHandler<ResolveConnectorIntegrationQuery> {
	constructor(@InjectRepository(Integration) private readonly repository: Pick<Repository<Integration>, 'findOne'>) {}
	execute({ id, provider, scope }: ResolveConnectorIntegrationQuery) {
		if (!id || !scope.tenantId) return Promise.resolve(null)
		const tenant = { id, provider, tenantId: scope.tenantId, organizationId: IsNull() }
		return this.repository.findOne({
			where: scope.organizationId ? [tenant, { ...tenant, organizationId: scope.organizationId }] : [tenant]
		})
	}
}
