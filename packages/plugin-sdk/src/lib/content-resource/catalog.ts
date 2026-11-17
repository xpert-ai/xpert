import type {
  ContentCatalogItem,
  ContentResourceSnapshot,
  ContentTypeImplementation,
  ContentSearchProjection,
  ContentTransferSnapshot
} from '@xpert-ai/contracts'
import type { ContentDocumentScope } from './document'
import type { ContentResourceReference, ContentSourceInput } from './index'

export type ContentResourceMutation =
  | { action: 'rename'; title: string }
  | { action: 'move'; rootPath: string }
  | { action: 'trash' | 'restore' }
  | { action: 'duplicate'; requestId: string; title: string }

/** Plugins retain their native model and ACL. Discovery is scoped and paginated, never a grant. */
export interface ContentCatalogProvider {
  /** Live path lookup for file owners before a rebuildable catalog entry exists. */
  resolveFile?(input: ContentDocumentScope & { path: string }): Promise<string | null>
  readonly types: ContentTypeImplementation[]
  /** Optional scoped implementations supplied by installed file codecs; never a permission grant. */
  listTypes?(scope: ContentDocumentScope): Promise<ContentTypeImplementation[]>
  /** Explicit opt-in for target creation; omission disables content transfer into this provider. */
  readonly acceptedTransferSchemas?: ReadonlyArray<ContentTransferSnapshot['schema']>
  discover(scope: ContentDocumentScope & { cursor?: string }): Promise<{ resourceIds: string[]; nextCursor?: string }>
  describe(input: ContentSourceInput): Promise<ContentResourceSnapshot>
  /** Optional safe text extractor. Must read the requested revision or reject a concurrent change. */
  extract?(input: ContentSourceInput & { expectedRevision: string }): Promise<ContentSearchProjection>
  /** Export only the requested revision in a negotiated schema, without credentials or query payloads.
   * The host validates the envelope and rechecks source access; the producer owns its native consistency rules. */
  transfer?(
    input: ContentSourceInput & {
      expectedRevision: string
      acceptedSchemas: ReadonlyArray<ContentTransferSnapshot['schema']>
    }
  ): Promise<ContentTransferSnapshot>
  /** Idempotent by requestId. initialContent comes from host validation, never directly from browser input.
   * Native creation retains its own ACL and persistence checks; transferred evidence is not a permission token. */
  create(
    input: ContentDocumentScope & {
      implementationKey: string
      requestId: string
      title: string
      templateId?: string
      initialContent?: ContentTransferSnapshot
    }
  ): Promise<ContentResourceReference>
  /** Idempotent repair of derived files only; must never overwrite newer native content. */
  reconcile?(input: ContentSourceInput): Promise<void>
  /** Optional project-local derived index consumer. Called by durable reconciliation,
   * including tombstones; must revalidate revision and never change the resource. */
  onResourceReconciled?(input: ContentDocumentScope & { item: ContentCatalogItem }): Promise<void>
  mutate?(
    input: ContentSourceInput & { expectedRevision: string; change: ContentResourceMutation }
  ): Promise<ContentResourceReference>
}
export interface ContentCatalogApi {
  types(scope: ContentDocumentScope): Promise<Array<ContentTypeImplementation & { providerKey: string }>>
  /** Rebuild derived catalog metadata explicitly, outside the first-page read path. */
  refresh(scope: ContentDocumentScope & { excludedProviderKeys?: string[] }): Promise<void>
  /** Project-scoped suppression metadata, including tombstones. These paths only hide
   * duplicate file entries; they must never be displayed or treated as access grants. */
  coverage(
    scope: ContentDocumentScope & { excludedProviderKeys?: string[] }
  ): Promise<Array<{ path: string; recursive: boolean }>>
  /** Reads an authorized page. Use indexed discovery for interactive lists and refresh
   * separately. The default retains synchronous discovery for existing callers. */
  list(
    scope: ContentDocumentScope & {
      excludedProviderKeys?: string[]
      contentIds?: string[]
      typeId?: string
      search?: string
      deleted?: boolean
      offset?: number
      limit?: number
      discovery?: 'refresh' | 'indexed'
      cursor?: string
    }
  ): Promise<{ items: ContentCatalogItem[]; hasMore: boolean; nextCursor?: string }>
  register(input: ContentDocumentScope & { source: ContentResourceReference }): Promise<ContentCatalogItem>
  get(input: ContentDocumentScope & { contentId: string }): Promise<ContentCatalogItem>
  projectText(
    input: ContentDocumentScope & { contentId: string; expectedRevision: string }
  ): Promise<ContentSearchProjection | null>
  create(
    input: ContentDocumentScope & {
      providerKey: string
      implementationKey: string
      requestId: string
      title: string
      templateId?: string
      /** The host reads this exact source revision; callers cannot supply source content. */
      transferFrom?: { contentId: string; expectedRevision: string }
    }
  ): Promise<ContentCatalogItem>
  mutate(
    input: ContentDocumentScope & { contentId: string; expectedRevision: string; change: ContentResourceMutation }
  ): Promise<ContentCatalogItem>
}
