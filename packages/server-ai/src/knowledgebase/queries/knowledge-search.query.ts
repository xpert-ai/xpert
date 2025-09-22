import { Metadata } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

export class KnowledgeSearchQuery implements IQuery {
	static readonly type = '[Knowledgebase] Similarity Search'

	constructor(
		public readonly input: {
			tenantId: string
			organizationId: string
			knowledgebases: string[]
			query: string
			k?: number
			score?: number
			filter?: Metadata
		}
	) {}
}
