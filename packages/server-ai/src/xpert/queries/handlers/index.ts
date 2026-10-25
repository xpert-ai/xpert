import { GetXpertAgentHandler } from './get-xpert-agent.handler'
import { FindXpertHandler } from './get-one.handler'
import { ResolveSpeechAssistantHandler } from './resolve-speech-assistant.handler'
import { GetXpertChatModelQueryHandler } from './get-xpert-chat-model.handler'
import { SearchXpertMemoryHandler } from './search-memory.handler'
import { GetXpertMemoryEmbeddingsHandler } from './get-memory-embedding.handler'
import { StatisticsXpertConversationsHandler } from './statistics-xpert-conv.handler'
import { StatisticsXpertMessagesHandler } from './statistics-xpert-messages.handler'
import { StatisticsXpertTokensHandler } from './statistics-xpert-tokens.handler'
import { StatisticsXpertsHandler } from './statistics-xperts.handler'
import { StatisticsXpertIntegrationsHandler } from './statistics-xpert-integrations.handler'
import { GetXpertWorkflowHandler } from './get-xpert-workflow.handler'
import { GetXpertRecoveryDefinitionHandler } from './get-xpert-recovery-definition.handler'
import { IsPublishedXpertInFamilyHandler } from './is-published-xpert-in-family.handler'

export const QueryHandlers = [
    FindXpertHandler,
    ResolveSpeechAssistantHandler,
    GetXpertAgentHandler,
    GetXpertChatModelQueryHandler,
    SearchXpertMemoryHandler,
    GetXpertMemoryEmbeddingsHandler,
    GetXpertWorkflowHandler,
    GetXpertRecoveryDefinitionHandler,
    StatisticsXpertConversationsHandler,
    StatisticsXpertMessagesHandler,
    StatisticsXpertTokensHandler,
    StatisticsXpertsHandler,
    StatisticsXpertIntegrationsHandler,
    IsPublishedXpertInFamilyHandler
]
