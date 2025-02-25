import { XpertAgentChatHandler } from "./chat.handler";
import { CreateWNAnswerHandler } from "./create-wn-answer.handler";
import { CreateWNIteratingHandler } from "./create-wn-iterating.handler";
import { CreateWorkflowNodeHandler } from "./create-workflow.handler";
import { XpertAgentExecuteHandler } from "./execute.handler";
import { XpertAgentInvokeHandler } from "./invoke.handler";
import { XpertAgentSubgraphHandler } from "./subgraph.handler";

export const CommandHandlers = [
    XpertAgentExecuteHandler,
    XpertAgentChatHandler,
    XpertAgentSubgraphHandler,
    XpertAgentInvokeHandler,
    CreateWorkflowNodeHandler,
    CreateWNIteratingHandler,
    CreateWNAnswerHandler
]
