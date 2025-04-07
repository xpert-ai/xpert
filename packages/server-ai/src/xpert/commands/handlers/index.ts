import { XpertChatHandler } from './chat.handler'
import { CreateMemoryStoreHandler } from './create-memory-store.handler'
import { XpertCreateHandler } from './create.handler'
import { XpertDelIntegrationHandler } from './del-integration.handler'
import { XpertExecuteHandler } from './execute.handler'
import { XpertExportDiagramHandler } from './export-diagram.handler'
import { XpertExportHandler } from './export.handler'
import { XpertImportHandler } from './import.handler'
import { XpertPublishIntegrationHandler } from './publish-integration.handler'
import { XpertPublishHandler } from './publish.handler'
import { XpertSummarizeMemoryHandler } from './summarize-memory.handler'

export const CommandHandlers = [
	XpertCreateHandler,
	XpertPublishHandler,
	XpertChatHandler,
	XpertExecuteHandler,
	XpertImportHandler,
	XpertExportHandler,
	XpertSummarizeMemoryHandler,
	XpertPublishIntegrationHandler,
	XpertDelIntegrationHandler,
	XpertExportDiagramHandler,
	CreateMemoryStoreHandler
]
