import { DocumentInterface } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IKnowledgebase } from './knowledgebase.model'

export type TDocumentAsset = {
  type: 'image' | 'video' | 'audio' | 'file'
  url: string // remote url
  filePath: string // local path
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
  /**
   * Whether the chunk is represented as a vector in the vector store
   */
  isVector?: boolean
  score?: number
  relevanceScore?: number

  [key: string]: any
}


/**
 * Segmented chunk of a knowledge document
 */
export interface IKnowledgeDocumentChunk<Metadata extends IDocChunkMetadata = any>
  extends DocumentInterface<Metadata>,
    IBasePerTenantAndOrganizationEntityModel {
  documentId?: string
  document?: IKnowledgeDocument
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase

  parent?: IKnowledgeDocumentChunk<Metadata>
  children?: IKnowledgeDocumentChunk<Metadata>[]
}


/**
 * Build a hierarchical tree structure from a flat list of DocumentInterface objects,
 * and 
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
  for (const doc of documents) {
    if (doc.metadata?.chunkId) {
      map.set(doc.metadata.chunkId, { ...doc, metadata: { ...doc.metadata, children: [] } })
    }
  }

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
  
  return roots
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