import { XpertChatHandler } from './chat.handler'
import { XpertChatContinueHandler } from './continue.handler'
import { XpertCreateHandler } from './create.handler'
import { XpertExecuteHandler } from './execute.handler'
import { XpertExportHandler } from './export.handler'
import { XpertImportHandler } from './import.handler'
import { XpertPublishHandler } from './publish.handler'

export const CommandHandlers = [
	XpertCreateHandler,
	XpertPublishHandler,
	XpertChatHandler,
	XpertChatContinueHandler,
	XpertExecuteHandler,
	XpertImportHandler,
	XpertExportHandler
]
