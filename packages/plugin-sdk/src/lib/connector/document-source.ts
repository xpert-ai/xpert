import type { ConnectorRuntimeCredentialV2 } from './strategy.interface'

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
export interface ConnectorDocumentQuery {
  query: string
  cursor?: string
  pageSize: number
}
/** Optional native connector hook. Credentials stay server-side; document access uses the same identity
 * as the connection. Start with explicit representations; never label plain text as a lossless rich document.
 */
export interface ConnectorDocumentSource {
  search(
    credential: ConnectorRuntimeCredentialV2,
    query: ConnectorDocumentQuery
  ): Promise<{ items: ConnectorDocumentEntry[]; nextCursor: string | null }>
  read(credential: ConnectorRuntimeCredentialV2, locator: string): Promise<ConnectorDocumentSnapshot>
}
