import { XpertAgentChatHandler } from './chat.handler'
import { CompileGraphHandler } from './compile-graph.handler'
import { CreateNodeConsumePendingSteerFollowUpsHandler } from './create-node-consume-pending-steer-follow-ups.handler'
import { CreateNodeStagePendingSteerFollowUpsHandler } from './create-node-stage-pending-steer-follow-ups.handler'
import { XpertAgentSwarmHandler } from './create-swarm.handler'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { XpertAgentSubgraphHandler } from './subgraph.handler'
import { CreateSummarizeTitleAgentHandler } from './summarize-title.handler'
import { XpertWorkflowSubgraphHandler } from './workflow-subgraph.handler'

export const CommandHandlers = [
	XpertAgentChatHandler,
	XpertAgentSubgraphHandler,
	XpertWorkflowSubgraphHandler,
	XpertAgentSwarmHandler,
	XpertAgentInvokeHandler,
	CompileGraphHandler,
	CreateSummarizeTitleAgentHandler,
	CreateNodeStagePendingSteerFollowUpsHandler,
	CreateNodeConsumePendingSteerFollowUpsHandler
]
