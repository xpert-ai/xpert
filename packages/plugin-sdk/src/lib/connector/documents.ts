import type { I18nText } from '@xpert-ai/contracts'
import type { OrganizationRuntimeActor } from '../runtime/actor'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ConnectorRuntimeCredentialV2, ConnectorScope } from './strategy.interface'

export interface ConnectorDocumentEntry {
  id: string
  title: string
  /** A validated public document URL, never a signed file URL. */
  url: string | null
  type: 'document'
}
export interface ConnectorDocumentSnapshot extends ConnectorDocumentEntry {
  revision: string
  /** Hash of the imported representation. Detects changes even if the provider revision is coarse. */
  contentHash: string
  format: 'text/plain'
  content: string
  warnings: string[]
}
export interface ConnectorDocumentQuery { query: string; cursor?: string; pageSize: number }
/** Optional native connector hook. Credentials stay server-side; document access uses the same identity
 * as the connection. Start with explicit representations; never label plain text as a lossless rich document.
 */
export interface ConnectorDocumentSource {
  search(credential: ConnectorRuntimeCredentialV2, query: ConnectorDocumentQuery): Promise<{ items: ConnectorDocumentEntry[]; nextCursor: string | null }>
  read(credential: ConnectorRuntimeCredentialV2, locator: string): Promise<ConnectorDocumentSnapshot>
}
export interface ConnectorDocumentContext { actor: OrganizationRuntimeActor; assistantId: string; projectId: string }
export interface ConnectorDocumentConnection {
  bindingId: string; provider: string; label: I18nText; scope: ConnectorScope
  status: string; available: boolean; managementUrl: string
}
/** Interactive, authenticated host API. The host lists permissible bindings itself; a client ID is
 * never a grant. This API does not grant arbitrary connectors to model/tool executions.
 */
export interface ConnectorDocumentsApi {
  sources(context: ConnectorDocumentContext): Promise<{ items: ConnectorDocumentConnection[] }>
  search(input: ConnectorDocumentContext & ConnectorDocumentQuery & { bindingId: string }): Promise<{ items: ConnectorDocumentEntry[]; nextCursor: string | null }>
  read(input: ConnectorDocumentContext & { bindingId: string; locator: string }): Promise<ConnectorDocumentSnapshot>
}
export const ConnectorDocumentsRuntimeCapability = createRuntimeCapability<ConnectorDocumentsApi>(
  'platform.connector.documents', { description: 'Read authorized connector documents for explicit project imports; never exposes credentials or writes remote content.' }
)
