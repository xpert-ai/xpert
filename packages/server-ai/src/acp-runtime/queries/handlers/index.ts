import { GetAcpSessionHandler } from './get-acp-session.handler'
import { ListAcpArtifactsHandler } from './list-acp-artifacts.handler'
import { ListAcpSessionEventsHandler } from './list-acp-session-events.handler'

export const QueryHandlers = [GetAcpSessionHandler, ListAcpSessionEventsHandler, ListAcpArtifactsHandler]
