import { createHash } from 'crypto'

export function normalizeImageChunkPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

export function createStableImageChunkId(filePath: string): string {
  const normalizedPath = normalizeImageChunkPath(filePath)

  if (!normalizedPath) {
    throw new Error('Image filePath is required to create a stable OCR chunkId')
  }

  return createHash('sha1').update(normalizedPath).digest('hex')
}
