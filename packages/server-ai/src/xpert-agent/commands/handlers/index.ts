import { XpertAgentChatHandler } from "./chat.handler";
import { XpertAgentExecuteHandler } from "./execute.handler";
import { XpertAgentInvokeHandler } from "./invoke.handler";
import { XpertAgentSubgraphHandler } from "./subgraph.handler";

export const CommandHandlers = [
    XpertAgentExecuteHandler,
    XpertAgentChatHandler,
    XpertAgentSubgraphHandler,
    XpertAgentInvokeHandler
]
