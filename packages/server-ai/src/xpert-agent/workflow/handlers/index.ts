import { WorkflowTestNodeHandler } from "./test.handler";
import { CreateWNAnswerHandler } from "./create-wn-answer.handler";
import { CreateWNIteratingHandler } from "./create-wn-iterating.handler";
import { CreateWorkflowNodeHandler } from "./create-workflow.handler";
import { CreateWNKnowledgeRetrievalHandler } from "./create-wn-knowledge-retrieval.handler";
import { CreateWNSubflowHandler } from "./create-wn-subflow.handler";

export const WorkflowCommandHandlers = [
    WorkflowTestNodeHandler,
    CreateWorkflowNodeHandler,
    CreateWNIteratingHandler,
    CreateWNAnswerHandler,
    CreateWNKnowledgeRetrievalHandler,
    CreateWNSubflowHandler
]
