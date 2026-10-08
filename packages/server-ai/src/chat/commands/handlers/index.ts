import { CancelChatHandler } from './cancel-chat.handler'
import { AdmittedChatCommonHandler } from './admitted-chat-common.handler'
import { ChatCommandHandler } from './chat.handler'
import { SpeechToTextHandler } from './speech-to-text.handler'
import { SynthesizeHandler } from './synthesize.handler'

export const CommandHandlers = [
    ChatCommandHandler,
    CancelChatHandler,
    AdmittedChatCommonHandler,
    SpeechToTextHandler,
    SynthesizeHandler
]
