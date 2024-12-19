// import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
// import { ChatConversation } from '../../conversation.entity'
// import { ChatConversationService } from '../../conversation.service'
// import { ChatConversationCreateCommand } from '../conversation-create.command'

// @CommandHandler(ChatConversationCreateCommand)
// export class ChatConversationCreateHandler implements ICommandHandler<ChatConversationCreateCommand> {
// 	constructor(
// 		private readonly chatConversationService: ChatConversationService,
// 		private readonly commandBus: CommandBus
// 	) {}

// 	public async execute(command: ChatConversationCreateCommand): Promise<any> {
// 		const { entity } = command.input
// 		return await this.chatConversationService.create(entity as ChatConversation)
// 	}
// }
