import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { ICommand } from '@nestjs/cqrs'

export class RagCreateVStoreCommand implements ICommand {
	static readonly type = '[Rag VStore] Create'

	constructor(
		public readonly embeddings: EmbeddingsInterface, 
		public readonly config: {
			collectionName?: string
		}
	) {}
}
