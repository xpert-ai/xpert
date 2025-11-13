import { Query } from '@nestjs/cqrs'

/**
 * Get database schema for custom tables.
 */
export class XpertDatabaseSchemaQuery extends Query<{ id: string; name: string; description?: string }[]> {
	static readonly type = '[Xpert Table] Get database schemas'

	constructor(
		public readonly options: {
			database: string
		}
	) {
		super()
	}
}
