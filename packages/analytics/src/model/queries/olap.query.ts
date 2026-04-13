import { IUser, TGatewayQueryEvent } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export class ModelOlapQuery implements IQuery {
	static readonly type = '[SemanticModel] olap'

	constructor(
		public readonly input: TGatewayQueryEvent & {
			sessionId: string
			body: string
		},
		public readonly user: Partial<IUser>
	) {}
}
