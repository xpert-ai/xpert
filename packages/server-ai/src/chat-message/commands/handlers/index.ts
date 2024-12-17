import { ChatMessageUpdateJobHandler } from './update-job.handler'
import { ChatMessageUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    ChatMessageUpsertHandler,
    ChatMessageUpdateJobHandler
]
