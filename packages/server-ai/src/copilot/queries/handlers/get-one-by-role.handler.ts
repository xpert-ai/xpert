import { ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotService } from '../../copilot.service'
import { CopilotOneByRoleQuery } from '../get-one-by-role.query'

@QueryHandler(CopilotOneByRoleQuery)
export class CopilotOneByRoleHandler implements IQueryHandler<CopilotOneByRoleQuery> {
	constructor(private readonly service: CopilotService) {}

	public async execute(command: CopilotOneByRoleQuery): Promise<ICopilot> {
		const items = await this.service.findAllAvailablesCopilots(command.tenantId, command.organizationId, {
			role: command.role
		})
		return items.length ? items[0] : null
	}
}
