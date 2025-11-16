import { Query } from '@nestjs/cqrs'

/**
 * Get available databases for custom tables.
 */
export class XpertDatabasesQuery extends Query<{ id: string; name: string; description?: string }[]> {
	static readonly type = '[Xpert Table] Get databases'

	constructor(
		public readonly options: {
			protocol: string
		}
	) {
		super()
	}
}
