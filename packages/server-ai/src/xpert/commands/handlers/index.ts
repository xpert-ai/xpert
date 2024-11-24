import { XpertChatHandler } from './chat.handler'
import { XpertCreateHandler } from './create.handler'
import { XpertExecuteHandler } from './execute.handler'
import { XpertImportHandler } from './import.handler'
import { XpertPublishHandler } from './publish.handler'

export const CommandHandlers = [
	XpertCreateHandler,
	XpertPublishHandler,
	XpertChatHandler,
	XpertExecuteHandler,
	XpertImportHandler
]
