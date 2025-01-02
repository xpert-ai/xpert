import { CancelChatHandler } from './cancel-chat.handler'
import { ChatCommonHandler } from './chat-common.handler'
import { ChatCommandHandler } from './chat.handler'

export const CommandHandlers = [
    ChatCommandHandler,
    CancelChatHandler,
    ChatCommonHandler
]
