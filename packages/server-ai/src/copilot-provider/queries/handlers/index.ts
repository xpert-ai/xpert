import { GetAiProviderCredentialsHandler } from "./get-credentials.handler";
import { GetCopilotProviderModelHandler } from "./get-model.handler";
import { CopilotProviderModelParameterRulesHandler } from "./model-parameter-rules.handler";

export const QueryHandlers = [
    GetCopilotProviderModelHandler,
    GetAiProviderCredentialsHandler,
    CopilotProviderModelParameterRulesHandler
];
