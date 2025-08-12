import { CopilotStoreBulkPutHandler } from "./bulk-put.handler";
import { CreateCopilotStoreHandler } from "./create-store.handler";

export const CommandHandlers = [
    CreateCopilotStoreHandler,
    CopilotStoreBulkPutHandler
]
