import { Document } from 'langchain/document'

export interface ChunkMetadata {
  documentId: string         // 原始文档 ID
  pageId?: string            // 如果有分页，引用页 ID
  chunkId: string            // 当前块的唯一 ID
  parentId?: string     // 如果是子块，引用父块 ID
  chunkIndex: number         // 在文档内或在父块内的序号
  startOffset: number        // 原始文本起始位置
  endOffset: number          // 原始文本结束位置
  type: 'parent' | 'child'   // 分块类型
  children?: Document<ChunkMetadata>[]
  [key: string]: any         // 允许插件扩展
}

/**
 * Merge parent chunks with their child chunks based on metadata (parentId and chunkId)
 * @param chunks 
 * @param children 
 * @returns 
 */
export function mergeParentChildChunks(chunks: Document<ChunkMetadata>[], children: Document<ChunkMetadata>[]): Document<ChunkMetadata>[] {
  const chunkMap = new Map<string, Document<ChunkMetadata>>()
  for (const chunk of chunks) {
    chunkMap.set(chunk.metadata.chunkId, chunk)
  }
  for (const child of children) {
    if (!child.metadata.parentId) continue
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