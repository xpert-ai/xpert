import type { I18nText } from '@xpert-ai/contracts'
import type { OrganizationRuntimeActor } from '../runtime/actor'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ConnectorScope } from './strategy.interface'

export type * from './document-source'
import type { ConnectorDocumentEntry, ConnectorDocumentQuery, ConnectorDocumentSnapshot } from './document-source'

export interface ConnectorDocumentContext {
  actor: OrganizationRuntimeActor
  assistantId: string
  projectId: string
}
export interface ConnectorDocumentConnection {
  bindingId: string
  provider: string
  label: I18nText
  scope: ConnectorScope
  status: string
  available: boolean
  managementUrl: string
}
/** Interactive, authenticated host API. The host lists permissible bindings itself; a client ID is
 * never a grant. This API does not grant arbitrary connectors to model/tool executions.
 */
export interface ConnectorDocumentsApi {
  sources(context: ConnectorDocumentContext): Promise<{ items: ConnectorDocumentConnection[] }>
  search(
    input: ConnectorDocumentContext & ConnectorDocumentQuery & { bindingId: string }
  ): Promise<{ items: ConnectorDocumentEntry[]; nextCursor: string | null }>
  read(input: ConnectorDocumentContext & { bindingId: string; locator: string }): Promise<ConnectorDocumentSnapshot>
}
export const ConnectorDocumentsRuntimeCapability = createRuntimeCapability<ConnectorDocumentsApi>(
  'platform.connector.documents',
  {
    description:
      'Read authorized connector documents for explicit project imports; never exposes credentials or writes remote content.'
  }
)
