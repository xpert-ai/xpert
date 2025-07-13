import { TCopilotModel } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Create memory store
 * @returns BaseStore
 */
export class CreateMemoryStoreCommand implements ICommand {
	static readonly type = '[Agent] Create memory embeddings'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly copilotModel: TCopilotModel,
        public readonly options: {
			abortController?: AbortController;
			tokenCallback?: (tokens: number) => void
		}
	) {}
}
