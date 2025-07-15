import { CopilotModelGetChatModelHandler } from './get-chat-model.handler'
import { CopilotModelGetEmbeddingsHandler } from './get-embeddings.handler'
import { CopilotModelGetRerankHandler } from './get-rerank.handler'

export const QueryHandlers = [CopilotModelGetChatModelHandler, CopilotModelGetEmbeddingsHandler, CopilotModelGetRerankHandler]
