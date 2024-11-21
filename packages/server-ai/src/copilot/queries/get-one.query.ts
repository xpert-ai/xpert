import { IQuery } from '@nestjs/cqrs'

/**
 * Query a single copilot by tenantId and copilot id. The tenantId parameter is required as the program might be running in the background.
 */
export class CopilotGetOneQuery implements IQuery {
	static readonly type = '[Copilot] Get One'

	constructor(
		public readonly tenantId: string,
		public readonly id: string,
		public readonly relations: string[]
	) {}
}
