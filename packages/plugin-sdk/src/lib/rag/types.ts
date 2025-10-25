import { DocumentInterface } from '@langchain/core/documents'
import { IDocChunkMetadata } from '@metad/contracts'
import fs from 'fs'
import http from 'http'
import https from 'https'

export type TDocumentAsset = {
  type: 'image' | 'video' | 'audio' | 'file'
  url: string // remote url
  filePath: string // local path
}

export interface ChunkMetadata extends IDocChunkMetadata{
  // documentId?: string // Original document ID
  // pageId?: string // Page ID if paginated
  // chunkId: string // Unique ID for this chunk
  // parentId?: string // References parent chunkId if this is a child chunk
  chunkIndex?: number // Index within the document or parent chunk
  startOffset?: number // Start position in the original text
  endOffset?: number // End position in the original text
  type?: 'parent' | 'child' // Chunk type
  /**
   * Default to 'text'. Indicates the original media type of the chunk.
   * @default text
   */
  mediaType?: 'text' | 'image' | 'video' | 'audio' // Media type of the chunk
  // children?: DocumentInterface<ChunkMetadata>[]
  /**
   * Associated assets like images, videos, etc.
   */
  assets?: TDocumentAsset[]
  [key: string]: any // Allow plugin extensions
}

/**
 * Merge parent chunks with their child chunks based on metadata (parentId and chunkId)
 * 
 * @deprecated use buildChunkTreeAndFindLeaves instead
 */
export function mergeParentChildChunks(
  chunks: DocumentInterface<ChunkMetadata>[], // Parent chunks
  children: DocumentInterface<ChunkMetadata>[] // Child chunks
): DocumentInterface<ChunkMetadata>[] {
  const chunkMap = new Map<string, DocumentInterface<ChunkMetadata>>()
  for (const chunk of chunks) {
    chunkMap.set(chunk.metadata.chunkId, chunk)
  }
  for (const child of children) {
    if (!child.metadata.parentId) {
      if (chunkMap.has(child.metadata.chunkId)) {
        console.warn(`Duplicate chunkId found: ${child.metadata.chunkId}, skipping...`)
        continue
      }
      chunkMap.set(child.metadata.chunkId, child)
      continue
    }
    const parent = chunkMap.get(child.metadata.parentId)
    if (parent) {
      if (!parent.metadata.children) {
        parent.metadata.children = []
      }
      parent.metadata.children.push(child)
    }
  }
  return Array.from(chunkMap.values())
}

export function isRemoteFile(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('ftp://')
}

export async function downloadRemoteFile(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`))
        return
      }
      response.pipe(file)
    })
    file.on('finish', () => {
      file.close()
      resolve(dest)
    })
    request.on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
    file.on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}
