import { IUser } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { TGatewayQuery } from '../types'

/**
 * Execute structured queries from the client
 */
export class ModelCubeQuery implements IQuery {
	static readonly type = '[SemanticModel] Cube query'

	constructor(
		public readonly input: {
			id: string
			sessionId: string
			dataSourceId: string;
			modelId: string
			body: TGatewayQuery['body']
			forceRefresh: boolean
			acceptLanguage?: string
		},
		public readonly user: Partial<IUser>
	) {}
}
