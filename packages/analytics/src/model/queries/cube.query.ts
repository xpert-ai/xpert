import { IUser, TGatewayQueryEvent } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Execute structured queries from the client
 */
export class ModelCubeQuery implements IQuery {
	static readonly type = '[SemanticModel] Cube query'

	constructor(
		public readonly input: TGatewayQueryEvent & {
			sessionId: string
		},
		public readonly user: Partial<IUser>
	) {}
}
