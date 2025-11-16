import { Query } from '@nestjs/cqrs'
import { DBQueryRunner } from '@xpert-ai/plugin-sdk'

/**
 * Get database adapter for custom tables.
 */
export class XpertDatabaseAdapterQuery extends Query<DBQueryRunner> {
	static readonly type = '[Xpert Table] Get database adapter'

	constructor(
		public readonly options: {
			id: string // Database ID
		}
	) {
		super()
	}
}
