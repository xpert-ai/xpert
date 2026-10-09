import { AdmittedXpertChatHandler } from './admitted-chat.handler'
import { GetRuntimeCapabilitiesHandler } from '../../runtime-capabilities/get-runtime-capabilities.handler'
import { CreateMemoryStoreHandler } from './create-memory-store.handler'
import { XpertCreateHandler } from './create.handler'
import { XpertDelIntegrationHandler } from './del-integration.handler'
import { XpertDeleteExportedTemplateHandler } from './delete-exported-template.handler'
import { XpertDeleteHandler } from './delete.handler'
import { XpertEnqueueTriggerDispatchHandler } from './enqueue-trigger-dispatch.handler'
import { XpertExecuteHandler } from './execute.handler'
import { XpertExportDiagramHandler } from './export-diagram.handler'
import { XpertExportHandler } from './export.handler'
import { XpertExportTemplateHandler } from './export-template.handler'
import { XpertImportHandler } from './import.handler'
import { XpertPublishIntegrationHandler } from './publish-integration.handler'
import { XpertPublishTriggersHandler } from './publish-triggers.handler'
import { XpertPublishHandler } from './publish.handler'
import { XpertSummarizeMemoryHandler } from './summarize-memory.handler'
import { XpertSyncTemplateHandler } from './sync-template.handler'

export const CommandHandlers = [
    GetRuntimeCapabilitiesHandler,
    XpertCreateHandler,
    XpertDeleteHandler,
    XpertEnqueueTriggerDispatchHandler,
    XpertPublishHandler,
    XpertPublishTriggersHandler,
    AdmittedXpertChatHandler,
    XpertExecuteHandler,
    XpertImportHandler,
    XpertExportHandler,
    XpertExportTemplateHandler,
    XpertDeleteExportedTemplateHandler,
    XpertSummarizeMemoryHandler,
    XpertPublishIntegrationHandler,
    XpertDelIntegrationHandler,
    XpertExportDiagramHandler,
    CreateMemoryStoreHandler,
    XpertSyncTemplateHandler
]
