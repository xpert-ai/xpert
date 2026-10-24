import { ConflictException, ForbiddenException } from '@nestjs/common'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from './volume'
import { readWorkspaceFile, writeWorkspaceFile } from './workspace-file-io'

describe('Shared workspace write boundary', () => {
  let root: string, volume: VolumeHandle
  const authorize = async () => undefined
  const assertUnmanaged = async () => undefined
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'workspace-file-io-'))
    volume = new VolumeHandle({ tenantId: 'tenant', catalog: 'projects', projectId: 'project' }, root, root, '')
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  it('rejects a stale Project CAS after an ordinary Workspace upload', async () => {
    const first = await writeWorkspaceFile(volume, 'note.md', Buffer.from('first'), { authorize, assertUnmanaged, expectedHash: null })
    await writeWorkspaceFile(volume, 'note.md', Buffer.from('upload'), { authorize, assertUnmanaged })
    await expect(writeWorkspaceFile(volume, 'note.md', Buffer.from('stale'), { authorize, assertUnmanaged, expectedHash: first.sha256 })).rejects.toThrow(ConflictException)
    expect((await readWorkspaceFile(volume, 'note.md')).buffer.toString()).toBe('upload')
  })
  it('rechecks managed ownership at commit and preserves original bytes on revocation', async () => {
    await writeWorkspaceFile(volume, 'note.md', Buffer.from('original'), { authorize, assertUnmanaged })
    let checks = 0
    await expect(writeWorkspaceFile(volume, 'note.md', Buffer.from('overwrite'), { authorize,
      assertUnmanaged: async () => { if (++checks > 1) throw new ForbiddenException() }
    })).rejects.toThrow(ForbiddenException)
    expect(checks).toBe(2)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('original')
  })
})
