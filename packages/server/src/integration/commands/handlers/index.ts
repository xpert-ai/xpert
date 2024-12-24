import { IntegrationDelHandler } from "./delete.handler";
import { IntegrationUpsertHandler } from "./upsert.handler";

export const CommandHandlers = [
    IntegrationUpsertHandler,
    IntegrationDelHandler
]
