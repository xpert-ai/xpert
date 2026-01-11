import { WorkflowTestNodeHandler } from "./test.handler";
import { CreateWorkflowNodeHandler } from "./create-workflow.handler";
import { CreateWNKnowledgeRetrievalHandler } from "./create-wn-knowledge-retrieval.handler";
import { CreateWNSubflowHandler } from "./create-wn-subflow.handler";
import { CreateWNClassifierHandler } from "./create-wn-classifier.handler";

export const WorkflowCommandHandlers = [
    WorkflowTestNodeHandler,
    CreateWorkflowNodeHandler,
    CreateWNKnowledgeRetrievalHandler,
    CreateWNSubflowHandler,
    CreateWNClassifierHandler
]
