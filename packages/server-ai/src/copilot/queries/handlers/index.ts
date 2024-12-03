import { FindCopilotModelsHandler } from "./copilot-model-find.handler";
import { CopilotGetChatHandler } from "./get-chat-copilot.handler";
import { CopilotOneByRoleHandler } from "./get-one-by-role.handler";
import { CopilotGetOneHandler } from "./get-one.handler";
import { ModelParameterRulesHandler } from "./model-parameter-rules.handler";

export const QueryHandlers = [
	FindCopilotModelsHandler,
	CopilotGetOneHandler,
	CopilotOneByRoleHandler,
	CopilotGetChatHandler,
	ModelParameterRulesHandler
];
