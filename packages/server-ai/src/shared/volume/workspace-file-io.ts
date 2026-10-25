import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { VolumeHandle } from './volume'
import { VolumeSubtreeClient } from './volume-subtree'
import { isProjectGovernedContentPath } from './project-content-path'
import { assertPublicWorkspacePath } from './workspace-managed-path'
import { withWorkspaceLock } from './workspace-storage-lock'

export const workspaceFileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
const missing = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

/** Call only after resolving an authorized volume. Containment and symlink checks remain in VolumeHandle. */
export function checkedWorkspacePath(value: string, projectWrite = false) {
  if (!value || value.includes('\\') || value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\0')))
    throw new BadRequestException(t('server-ai:Error.WorkspaceFilePathRequired'))
  assertPublicWorkspacePath(value)
  if (projectWrite && isProjectGovernedContentPath(value))
    throw new ForbiddenException(t('server-ai:Error.ProjectContentApiRequired'))
  return value
}

export async function readWorkspaceFile(volume: VolumeHandle, filePath: string) {
  const buffer = await new VolumeSubtreeClient(volume, { allowRootWorkspace: true }).readBuffer('', checkedWorkspacePath(filePath))
  return { buffer, sha256: workspaceFileHash(buffer) }
}

/** Shared write boundary for ProjectFiles and WorkspaceFiles uploads.
 * Ownership and optional compare-and-swap are checked under the same workspace lock and again at commit.
 * undefined expectedHash means an ordinary replacement; null means create-only; a hash means CAS.
 */
export async function writeWorkspaceFile(volume: VolumeHandle, filePath: string, buffer: Buffer, options: {
  expectedHash?: string | null
  authorize: () => Promise<unknown>
  assertUnmanaged: () => Promise<unknown> | undefined
}) {
  checkedWorkspacePath(filePath, volume.scope.catalog === 'projects')
  await volume.ensureRoot()
  return withWorkspaceLock(volume.serverRoot, async () => {
    const verify = async () => {
      await options.authorize()
      await options.assertUnmanaged()
      if (options.expectedHash !== undefined) {
        const current = await readWorkspaceFile(volume, filePath).catch((error: unknown) => {
          if (missing(error)) return null
          throw error
        })
        if ((current?.sha256 ?? null) !== options.expectedHash)
          throw new ConflictException(t('server-ai:Error.ProjectFileChanged'))
      }
    }
    await verify()
    const written = await volume.writeFile(filePath, buffer, {
      createOnly: options.expectedHash === null,
      beforeCommit: verify,
      assertCanWrite: (relative, stat) => {
        if (volume.scope.catalog === 'projects' && (isProjectGovernedContentPath(relative) || (stat && stat.nlink !== 1)))
          throw new ForbiddenException(t('server-ai:Error.ProjectContentApiRequired'))
      }
    })
    if (!written) throw new ConflictException(t('server-ai:Error.ProjectFileChanged'))
    return { sha256: workspaceFileHash(buffer) }
  }, 5000)
}
