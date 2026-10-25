import type { ContentReferenceEntry, ContentReferencePage, ContentReferenceTarget } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ContentSourceInput } from './index'
import type { ContentDocumentInput } from './document'
import type { WorkspacePortableFileReference } from '../runtime/capabilities/workspace-files'

export type ContentReferenceQuery = {
  kind: ContentReferenceTarget['kind']
  query: string
  cursor?: string
  pageSize: number
}
export type ContentReferenceUpload = { kind: 'image' | 'file'; fileName: string; mimeType: string; buffer: Buffer }
export type ContentReferenceFile = {
  reference: WorkspacePortableFileReference
  fileName: string
  mimeType: string
  size?: number
}
/** Optional source-provider hooks use the containing document's SOURCE id, not its platform id. */
export interface ContentReferenceProvider {
  listReferences?(input: ContentSourceInput & ContentReferenceQuery): Promise<ContentReferencePage>
  uploadReference?(input: ContentSourceInput & ContentReferenceUpload): Promise<ContentReferenceEntry>
  resolveReference?(input: ContentSourceInput & { target: ContentReferenceTarget }): Promise<ContentReferenceFile>
}
export interface ContentReferencesApi {
  list(input: ContentDocumentInput & ContentReferenceQuery): Promise<ContentReferencePage>
  upload(input: ContentDocumentInput & ContentReferenceUpload): Promise<ContentReferenceEntry>
  resolve(input: ContentDocumentInput & { target: ContentReferenceTarget }): Promise<ContentReferenceFile>
}
export const ContentReferencesRuntimeCapability = createRuntimeCapability<ContentReferencesApi>(
  'platform.content.references',
  { description: 'Authorized durable document references; plugins provide source-specific listing and files.' }
)
