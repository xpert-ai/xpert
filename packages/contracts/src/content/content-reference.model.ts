/** Persistent identity only. Never serialize signed URLs or connector credentials into a document.
 * Markdown representation: xpert-resource://v1/{kind}/{providerKey}/{resourceId}.
 * Resolving a reference does not grant access; the source and containing project are checked again.
 */
export interface ContentReferenceTarget {
  kind: 'image' | 'file' | 'page'
  providerKey: string
  resourceId: string
}
export interface ContentReferenceEntry extends ContentReferenceTarget {
  title: string
  path: string
  mimeType: string
  size: number | null
}
export interface ContentReferencePage {
  items: ContentReferenceEntry[]
  nextCursor: string | null
}
