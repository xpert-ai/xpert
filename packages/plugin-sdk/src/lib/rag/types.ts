import fs from 'fs'
import http from 'http'
import https from 'https'
import { Document } from 'langchain/document'

export type TDocumentAsset = {
  type: 'image' | 'video' | 'audio' | 'file'
  url: string // remote url
  filePath: string // local path
}

export interface ChunkMetadata {
  documentId: string // 原始文档 ID
  pageId?: string // 如果有分页，引用页 ID
  chunkId: string // 当前块的唯一 ID
  parentId?: string // 如果是子块，引用父块 ID
  chunkIndex: number // 在文档内或在父块内的序号
  startOffset: number // 原始文本起始位置
  endOffset: number // 原始文本结束位置
  type: 'parent' | 'child' // 分块类型
  children?: Document<ChunkMetadata>[]
  assets?: TDocumentAsset[]
  [key: string]: any // 允许插件扩展
}

/**
 * Merge parent chunks with their child chunks based on metadata (parentId and chunkId)
 * @param chunks
 * @param children
 * @returns
 */
export function mergeParentChildChunks(
  chunks: Document<ChunkMetadata>[], // Parent chunks
  children: Document<ChunkMetadata>[] // Child chunks
): Document<ChunkMetadata>[] {
  const chunkMap = new Map<string, Document<ChunkMetadata>>()
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
