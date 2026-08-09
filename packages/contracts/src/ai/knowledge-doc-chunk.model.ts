import { DocumentInterface } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IKnowledgebase } from './knowledgebase.model'

export type TDocumentAsset = {
  type: 'image' | 'video' | 'audio' | 'file'
  url: string // remote url
  filePath: string // local path
  sourceType?: 'pdf_page' | 'docx_embedded_image' | 'image_file'
  page?: number
  order?: number
  altText?: string
}

/** Stable, provider-neutral layout categories understood by the preview UI. */
export type DocumentAnalysisBlockType =
  | 'text'
  | 'title'
  | 'table'
  | 'image'
  | 'formula'
  | 'header'
  | 'footer'
  | 'footnote'
  | 'page-number'
  | 'seal'
  | 'other'

/** Rectangle in the transformer-reported page coordinate system; values are not normalized to 0..1. */
export type DocumentAnalysisBounds = {
  x: number
  y: number
  width: number
  height: number
}

/** Polygon vertex in the transformer-reported page coordinate system. */
export type DocumentAnalysisPoint = {
  x: number
  y: number
}

/**
 * Provider-neutral page-layout metadata emitted by a document transformer before text splitting.
 * Coordinates use the top-left of the recognized page as their origin.
 */
export type DocumentLayoutMetadata = {
  schemaVersion: 1
  /** Global, 1-based source-document page number, including documents converted in batches. */
  page: number
  /** Provider-reported page dimensions used to project bounds over the rendered source page. */
  pageWidth: number
  pageHeight: number
  /** Stable identifier and reading order before downstream text splitting. */
  blockId: string
  order: number
  type: DocumentAnalysisBlockType
  providerType?: string
  providerSubType?: string
  bounds?: DocumentAnalysisBounds
  polygon?: DocumentAnalysisPoint[]
  /** Optional archived image/table asset associated with this exact layout block. */
  asset?: TDocumentAsset
  /** Lossless provider payload retained for inspection; consumers must not assume its schema. */
  raw?: Record<string, unknown>
}

/** Provider-neutral description of the structured document produced by a transformer. */
export type DocumentAnalysisMetadata = {
  schemaVersion: 1
  provider: string
  engine?: string
  pageCount?: number
  coordinateSystem: 'page-top-left'
  markdownAsset?: TDocumentAsset
  rawAssets?: TDocumentAsset[]
}

/** Read model returned for one block in the paged analysis-preview API. */
export type KnowledgeDocumentAnalysisBlock = {
  id: string
  order: number
  type: DocumentAnalysisBlockType
  providerType?: string
  providerSubType?: string
  markdown: string
  bounds?: DocumentAnalysisBounds
  polygon?: DocumentAnalysisPoint[]
  assetId?: string
}

/** Self-contained page record loaded independently for large documents. */
export type KnowledgeDocumentAnalysisPage = {
  schemaVersion: 1
  page: number
  width: number
  height: number
  markdown: string
  blocks: KnowledgeDocumentAnalysisBlock[]
}

/** Capability response; unavailable snapshots expose a reason instead of throwing during page setup. */
export type KnowledgeDocumentAnalysisPreview =
  | {
      available: false
      reason: 'missing' | 'stale' | 'corrupt' | 'unsupported'
    }
  | {
      available: true
      schemaVersion: 1
      provider: string
      engine?: string
      pageCount: number
      pages: number[]
      sourceType?: string
      sourceMimeType?: string
      views: Array<'markdown' | 'structure' | 'tables' | 'images' | 'json'>
    }

export interface IDocChunkMetadata {
  chunkId: string
  parentId?: string | null
  children?: DocumentInterface<IDocChunkMetadata>[]

  knowledgeId?: string
  chunkIndex?: number // Index within the document or parent chunk
  enabled?: boolean

  /**
   * Default to 'text'. Indicates the original media type of the chunk.
   * @default text
   */
  mediaType?: 'text' | 'image' | 'video' | 'audio' // Media type of the chunk
  /**
   * Associated assets like images, videos, etc.
   */
  assets?: TDocumentAsset[]
  /** Original structured layout before text splitting. */
  documentLayout?: DocumentLayoutMetadata
  /**
   * Whether the chunk is represented as a vector in the vector store
   */
  isVector?: boolean
  score?: number
  relevanceScore?: number

  // tokens
  tokens?: number

  [key: string]: any
}

/**
 * Segmented chunk of a knowledge document
 */
export interface IKnowledgeDocumentChunk<Metadata extends IDocChunkMetadata = any>
  extends DocumentInterface<Metadata>, IBasePerTenantAndOrganizationEntityModel {
  contentHash?: string | null
  version?: number

  documentId?: string
  document?: IKnowledgeDocument
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase

  parent?: IKnowledgeDocumentChunk<Metadata>
  children?: IKnowledgeDocumentChunk<Metadata>[]
}

/**
 * Build a hierarchical tree structure from a flat list of DocumentInterface objects,
 * preserving explicit chunkIndex order whenever it is available.
 *
 * @template Metadata - Type of metadata, defaults to IDocChunkMetadata
 * @param documents - A flat array of DocumentInterface objects
 * @returns the hierarchical tree (root-level DocumentInterface[])
 */
export function buildChunkTree<Metadata extends IDocChunkMetadata = IDocChunkMetadata>(
  documents: DocumentInterface<Metadata>[]
): DocumentInterface<Metadata>[] {
  if (!documents || documents.length === 0) return []

  // Step 1. Build a lookup map for quick access by chunkId
  const map = new Map<string, DocumentInterface<Metadata>>()
  // Keep the original retrieval/insertion order as a deterministic fallback.
  const inputOrder = new Map<string, number>()
  documents.forEach((doc, index) => {
    const chunkId = getChunkNodeId(doc)
    if (chunkId) {
      map.set(chunkId, { ...doc, metadata: { ...doc.metadata, chunkId, children: [] } })
      inputOrder.set(chunkId, index)
    }
  })

  // Step 2. Organize nodes into tree
  const roots: DocumentInterface<Metadata>[] = []

  for (const doc of map.values()) {
    const parentId = doc.metadata.parentId
    if (parentId && map.has(parentId)) {
      const parent = map.get(parentId)
      parent.metadata.children = parent.metadata.children || []
      parent.metadata.children.push(doc)
    } else {
      roots.push(doc)
    }
  }

  sortChunkNodes(roots, inputOrder)
  return roots
}

function getChunkNodeId<Metadata extends IDocChunkMetadata>(document: DocumentInterface<Metadata>): string | undefined {
  if (document.metadata?.chunkId) {
    return document.metadata.chunkId
  }

  if ('id' in document && typeof document.id === 'string' && document.id) {
    return document.id
  }

  return undefined
}

function sortChunkNodes<Metadata extends IDocChunkMetadata>(
  nodes: DocumentInterface<Metadata>[],
  inputOrder: Map<string, number>
) {
  // Sort every sibling group, including nested children, so the rendered tree matches document flow.
  nodes.sort((left, right) => compareChunkNodes(left, right, inputOrder))

  for (const node of nodes) {
    if (node.metadata.children?.length) {
      sortChunkNodes(node.metadata.children as DocumentInterface<Metadata>[], inputOrder)
    }
  }
}

function compareChunkNodes<Metadata extends IDocChunkMetadata>(
  left: DocumentInterface<Metadata>,
  right: DocumentInterface<Metadata>,
  inputOrder: Map<string, number>
) {
  // chunkIndex is the canonical document-order signal; input order is only a fallback.
  const leftIndex = getFiniteNumber(left.metadata.chunkIndex)
  const rightIndex = getFiniteNumber(right.metadata.chunkIndex)
  if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
    return leftIndex - rightIndex
  }
  if (leftIndex !== undefined || rightIndex !== undefined) {
    return leftIndex !== undefined ? -1 : 1
  }

  const leftOrder = inputOrder.get(left.metadata.chunkId) ?? 0
  const rightOrder = inputOrder.get(right.metadata.chunkId) ?? 0
  return leftOrder - rightOrder
}

function getFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Find all leaf nodes (nodes without children).
 *
 * @param roots
 * @returns
 */
export function collectTreeLeaves(roots: IKnowledgeDocumentChunk[]) {
  const leaves: IKnowledgeDocumentChunk[] = []

  const collectLeaves = (node: IKnowledgeDocumentChunk) => {
    const children = node.metadata.children
    if (!children || children.length === 0) {
      leaves.push(node)
    } else {
      for (const child of children) {
        collectLeaves(child as IKnowledgeDocumentChunk)
      }
    }
  }

  for (const root of roots) {
    collectLeaves(root)
  }

  return leaves
}
