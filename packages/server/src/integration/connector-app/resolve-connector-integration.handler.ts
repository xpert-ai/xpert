import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ResolveConnectorIntegrationQuery } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { canConsumeIntegration } from '../sharing/integration-sharing.policy'
import { Integration } from '../integration.entity'

@QueryHandler(ResolveConnectorIntegrationQuery)
export class ResolveConnectorIntegrationHandler implements IQueryHandler<ResolveConnectorIntegrationQuery> {
	constructor(@InjectRepository(Integration) private readonly repository: Pick<Repository<Integration>, 'findOne'>) {}
	async execute({ id, provider, scope }: ResolveConnectorIntegrationQuery) {
		if (!id || !scope.tenantId) return Promise.resolve(null)
		const tenant = { id, provider, tenantId: scope.tenantId, organizationId: IsNull() }
		const integration = await this.repository.findOne({
			where: scope.organizationId ? [tenant, { ...tenant, organizationId: scope.organizationId }] : [tenant]
		})
		return integration && canConsumeIntegration(integration, scope, 'configuration') ? integration : null
	}
}
