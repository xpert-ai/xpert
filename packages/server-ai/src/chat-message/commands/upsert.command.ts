import { IChatMessage } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatMessageUpsertCommand implements ICommand {
	static readonly type = '[Chat Message] Upsert'

	constructor(public readonly entity: Partial<IChatMessage>) {}
}
