import { GetAiProviderCredentialsHandler } from "./get-credentials.handler";
import { GetCopilotProviderModelHandler } from "./get-model.handler";

export const QueryHandlers = [
    GetCopilotProviderModelHandler,
    GetAiProviderCredentialsHandler
];
