import { ICommand } from '@nestjs/cqrs'
import { IndexConfig } from '@langchain/langgraph-checkpoint'

/**
 * Ceate a new Copilot Store instance for user and embeddings model
 */
export class CreateCopilotStoreCommand implements ICommand {
	static readonly type = '[Copilot Store] Create one instance'

	constructor(
		public readonly options: {
			tenantId?: string;
			organizationId?: string;
			userId?: string;
			index?: IndexConfig
		}
	) {}
}
