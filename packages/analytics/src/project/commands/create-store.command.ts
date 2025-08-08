import { ICommand } from '@nestjs/cqrs'
import { IndexConfig } from '@langchain/langgraph-checkpoint'

/**
 * Ceate a new memory Store instance for BI project
 */
export class CreateProjectStoreCommand implements ICommand {
	static readonly type = '[Project] Create memory store'

	constructor(
		public readonly options?: {
			tenantId?: string;
			organizationId?: string;
			userId?: string;
			index?: Partial<IndexConfig>;
		}
	) {}
}
