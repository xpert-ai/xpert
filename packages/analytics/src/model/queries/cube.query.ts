import { IUser } from '@metad/contracts'
import { QueryOptions } from '@metad/ocap-core'
import { IQuery } from '@nestjs/cqrs'

export class ModelCubeQuery implements IQuery {
	static readonly type = '[SemanticModel] Cube query'

	constructor(
		public readonly input: {
			id: string
			sessionId: string
			dataSourceId: string;
			modelId: string
			body: {
				mdx: string
				query: QueryOptions
			}
			forceRefresh: boolean
			acceptLanguage?: string
		},
		public readonly user: Partial<IUser>
	) {}
}
