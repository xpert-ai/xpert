import { IQuery } from '@nestjs/cqrs'

export class GetCopilotOrgUsageQuery implements IQuery {
	static readonly type = '[Copilot Organization] Get Tokens'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly copilotId: string,
	) {}
}
