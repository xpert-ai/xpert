import type { IKnowledgeDocument } from '@xpert-ai/contracts'

type OriginalFileDescriptor = Pick<IKnowledgeDocument, 'name' | 'type'>

/**
 * Distinguishes a legitimate JSON source document from an API error serialized as JSON. Blob-based
 * downloads otherwise hide non-2xx response bodies from the normal HTTP error pipeline.
 */
export async function validateOriginalFileResponse(blob: Blob, document: OriginalFileDescriptor) {
  if (!isJsonMimeType(blob.type) || isJsonDocument(document)) {
    return blob
  }

  const message = await readJsonErrorMessage(blob)
  throw new Error(message || 'The original file could not be loaded.')
}

async function readJsonErrorMessage(blob: Blob) {
  try {
    const body: unknown = JSON.parse(await readBlobText(blob))
    if (isRecord(body)) {
      if (typeof body['message'] === 'string') {
        return body['message']
      }
      if (Array.isArray(body['message'])) {
        return body['message'].filter((item): item is string => typeof item === 'string').join(', ')
      }
    }
  } catch {
    return null
  }

  return null
}

function readBlobText(blob: Blob) {
  if (typeof blob.text === 'function') {
    return blob.text()
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function isJsonDocument(document: OriginalFileDescriptor) {
  return document.type?.toLowerCase() === 'json' || document.name?.toLowerCase().endsWith('.json')
}

function isJsonMimeType(mimeType: string) {
  return /^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(mimeType)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
