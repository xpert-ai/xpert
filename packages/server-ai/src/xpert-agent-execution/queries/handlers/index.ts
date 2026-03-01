import { FindExecutionsByXpertHandler } from "./find-by-expert.handler";
import { FindAgentExecutionsHandler } from "./find.handler";
import { XpertAgentExecutionStateHandler } from "./get-state.handler";
import { XpertAgentExecutionOneHandler } from "./get-one.handler";
import { GetThreadContextUsageHandler } from "./get-thread-context-usage.handler";

export const QueryHandlers = [
	FindExecutionsByXpertHandler,
	FindAgentExecutionsHandler,
	XpertAgentExecutionOneHandler,
	XpertAgentExecutionStateHandler,
	GetThreadContextUsageHandler
];
