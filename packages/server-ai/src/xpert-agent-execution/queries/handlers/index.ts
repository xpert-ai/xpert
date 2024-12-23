import { FindExecutionsByXpertHandler } from "./find-by-expert.handler";
import { FindAgentExecutionsHandler } from "./find.handler";
import { XpertAgentExecutionStateHandler } from "./get-state.handler";
import { XpertAgentExecutionOneHandler } from "./get-one.handler";

export const QueryHandlers = [
	FindExecutionsByXpertHandler,
	FindAgentExecutionsHandler,
	XpertAgentExecutionOneHandler,
	XpertAgentExecutionStateHandler
];
