import { GetXpertAgentHandler } from "./get-xpert-agent.handler";
import { FindXpertHandler } from "./get-one.handler";
import { GetXpertChatModelQueryHandler } from "./get-xpert-chat-model.handler";
import { SearchXpertMemoryHandler } from "./search-memory.handler";
import { GetXpertMemoryEmbeddingsHandler } from "./get-memory-embedding.handler";
import { StatisticsXpertConversationsHandler } from "./statistics-xpert-conv.handler";
import { StatisticsXpertMessagesHandler } from "./statistics-xpert-messages.handler";
import { StatisticsXpertTokensHandler } from "./statistics-xpert-tokens.handler";
import { StatisticsXpertsHandler } from "./statistics-xperts.handler";
import { StatisticsXpertIntegrationsHandler } from "./statistics-xpert-integrations.handler";


export const QueryHandlers = [
	FindXpertHandler,
	GetXpertAgentHandler,
	GetXpertChatModelQueryHandler,
	SearchXpertMemoryHandler,
	GetXpertMemoryEmbeddingsHandler,
	StatisticsXpertConversationsHandler,
	StatisticsXpertMessagesHandler,
	StatisticsXpertTokensHandler,
	StatisticsXpertsHandler,
	StatisticsXpertIntegrationsHandler
];
