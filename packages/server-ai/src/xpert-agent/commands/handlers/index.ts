import { XpertAgentChatHandler } from './chat.handler'
import { CompileGraphHandler } from './compile-graph.handler'
import { XpertAgentSwarmHandler } from './create-swarm.handler'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { XpertAgentSubgraphHandler } from './subgraph.handler'
import { CreateSummarizeTitleAgentHandler } from './summarize-title.handler'

export const CommandHandlers = [
	XpertAgentChatHandler,
	XpertAgentSubgraphHandler,
	XpertAgentSwarmHandler,
	XpertAgentInvokeHandler,
	CompileGraphHandler,
	CreateSummarizeTitleAgentHandler
]
