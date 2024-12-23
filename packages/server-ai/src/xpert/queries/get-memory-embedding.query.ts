import { TLongTermMemory } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Create Embeddings model for memory of xpert
 */
export class GetXpertMemoryEmbeddingsQuery implements IQuery {
	static readonly type = '[Xpert] Create memory embeddings'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly memory: TLongTermMemory,
        public readonly options: {
			abortController?: AbortController;
			tokenCallback?: (tokens: number) => void
		}
	) {}
}
