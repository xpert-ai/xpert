import { ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotOneByRoleQuery } from '../get-one-by-role.query'
import { CopilotService } from '../../copilot.service'

@QueryHandler(CopilotOneByRoleQuery)
export class CopilotOneByRoleHandler implements IQueryHandler<CopilotOneByRoleQuery> {
	constructor(
		private readonly service: CopilotService
	) {}

	public async execute(command: CopilotOneByRoleQuery): Promise<ICopilot> {
		return await this.service.findOneByRole(command.role, command.tenantId, command.organizationId)
	}
}
