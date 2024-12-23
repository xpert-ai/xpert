import { XpertChatHandler } from './chat.handler'
import { XpertCreateHandler } from './create.handler'
import { XpertExecuteHandler } from './execute.handler'
import { XpertExportHandler } from './export.handler'
import { XpertImportHandler } from './import.handler'
import { XpertPublishHandler } from './publish.handler'
import { XpertSummarizeMemoryHandler } from './summarize-memory.handler'

export const CommandHandlers = [
	XpertCreateHandler,
	XpertPublishHandler,
	XpertChatHandler,
	XpertExecuteHandler,
	XpertImportHandler,
	XpertExportHandler,
	XpertSummarizeMemoryHandler
]
