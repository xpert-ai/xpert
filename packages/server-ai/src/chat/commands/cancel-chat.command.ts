import { ChatGatewayEvent, IUser } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CancelChatCommand implements ICommand {
	static readonly type = '[Chat] Cancel'

	constructor(
		public readonly input: {
			event: ChatGatewayEvent.CancelChain
			data: {
				conversationId: string // Conversation ID
				id?: string // Message id
			}
			tenantId: string
			organizationId?: string
			user: IUser
		}
	) {}
}
