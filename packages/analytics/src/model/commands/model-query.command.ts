import { TGatewayQueryEvent } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs'

export class SemanticModelQueryCommand implements ICommand {
	static readonly type = '[Semantic Model] Query'

	constructor(public readonly input: { sessionId: string; userId: string; data: TGatewayQueryEvent }) {}
}
