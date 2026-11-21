// Stage identities come from the host. The CLI reads exact bytes instead of
// relying on a coordinating model to transcribe IDs into a second prompt.
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { canonical } from './constants'
import {
  ProjectFilesRuntimeCapability,
  type ProjectPipelineAssistantContext,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { conflict } from './store'
import type { Phase } from './schemas'

export const manifestContextPath = (operationId: string) =>
  `.coding-delivery/stages/${operationId}/manifest-context.json`

export async function prepareManifestContext(
  capabilities: RuntimeCapabilityRegistry,
  context: ProjectPipelineAssistantContext,
  phase: Phase
) {
  const files = capabilities.require(ProjectFilesRuntimeCapability)
  const path = manifestContextPath(context.work.operationId)
  const identity = { version: 1, phase, work: context.work }
  const buffer = Buffer.from(canonical(identity) + '\n')
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  await files.mkdir({ ...context, path: `.coding-delivery/stages/${context.work.operationId}` })
  try {
    await files.write({ ...context, path, buffer, expectedHash: null })
  } catch (error) {
    // Only a create conflict can be an idempotent replay. Host errors may cross
    // package copies; preserve access/storage failures without class-identity checks.
    if (
      typeof error !== 'object' ||
      error === null ||
      !('getStatus' in error) ||
      typeof error.getStatus !== 'function' ||
      error.getStatus() !== 409
    )
      throw error
    const existing = await files.read({ ...context, path })
    if (existing.sha256 === sha256) return { path, sha256 }
    // Older files retain their original bytes and digest across JSONB/schema round trips.
    let stored: unknown
    try {
      stored = JSON.parse(existing.buffer.toString('utf8'))
    } catch {
      throw conflict('CODING_MANIFEST_WORK_MISMATCH')
    }
    if (!isDeepStrictEqual(stored, identity)) throw conflict('CODING_MANIFEST_WORK_MISMATCH')
    return { path, sha256: existing.sha256 }
  }
  return { path, sha256 }
}
