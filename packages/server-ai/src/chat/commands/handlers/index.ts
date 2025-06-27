import { CancelChatHandler } from './cancel-chat.handler'
import { ChatCommonHandler } from './chat-common.handler'
import { ChatCommandHandler } from './chat.handler'
import { SpeechToTextHandler } from './speech-to-text.handler'
import { SynthesizeHandler } from './synthesize.handler'

export const CommandHandlers = [
    ChatCommandHandler,
    CancelChatHandler,
    ChatCommonHandler,
    SpeechToTextHandler,
    SynthesizeHandler
]
