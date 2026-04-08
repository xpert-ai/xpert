import { IQuery } from '@nestjs/cqrs'

/**
 * Get a ai model provider by name
 */
export class AIModelGetProviderQuery implements IQuery {
	static readonly type = '[AI Model] Get a Provider'

	constructor(
		public readonly name: string,
		public readonly organizationId?: string
	) {}
}
