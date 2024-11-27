import { ICopilotOrganization } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotOrganization } from '../../copilot-organization.entity'
import { CopilotOrganizationService } from '../../copilot-organization.service'
import { GetCopilotOrgUsageQuery } from '../get-tokens.query'

@QueryHandler(GetCopilotOrgUsageQuery)
export class GetCopilotOrgUsageHandler implements IQueryHandler<GetCopilotOrgUsageQuery> {
	constructor(
		@InjectRepository(CopilotOrganization)
		private readonly repository: Repository<CopilotOrganization>,
		private readonly service: CopilotOrganizationService
	) {}

	public async execute(command: GetCopilotOrgUsageQuery): Promise<ICopilotOrganization> {
		const { tenantId, copilotId, organizationId } = command

		const result = await this.service.findOneOrFail({ where: { tenantId, copilotId, organizationId } })
		return result.record
	}
}
