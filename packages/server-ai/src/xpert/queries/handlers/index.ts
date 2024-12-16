import { GetXpertAgentHandler } from "./get-xpert-agent.handler";
import { FindXpertHandler } from "./get-one.handler";
import { GetXpertChatModelQueryHandler } from "./get-xpert-chat-model.handler";

export const QueryHandlers = [
	FindXpertHandler,
	GetXpertAgentHandler,
	GetXpertChatModelQueryHandler
];
