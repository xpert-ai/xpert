import { ICommand } from '@nestjs/cqrs'
import { TGatewayQuery } from '../types'

export class SemanticModelQueryCommand implements ICommand {
	static readonly type = '[Semantic Model] Query'

	constructor(public readonly input: { sessionId: string; userId: string; data: TGatewayQuery }) {}
}
