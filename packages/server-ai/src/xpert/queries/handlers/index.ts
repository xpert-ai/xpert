import { GetXpertAgentHandler } from "./get-xpert-agent.handler";
import { FindXpertHandler } from "./get-one.handler";
import { GetXpertChatModelQueryHandler } from "./get-xpert-chat-model.handler";
import { SearchXpertMemoryHandler } from "./search-memory.handler";
import { GetXpertMemoryEmbeddingsHandler } from "./get-memory-embedding.handler";


export const QueryHandlers = [
	FindXpertHandler,
	GetXpertAgentHandler,
	GetXpertChatModelQueryHandler,
	SearchXpertMemoryHandler,
	GetXpertMemoryEmbeddingsHandler,
];
