import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { XpFileSystem } from './file-system'

describe('XpFileSystem', () => {
  const permission = {
    type: 'filesystem' as const,
    operations: ['read', 'write', 'list'] as const,
    scope: []
  }

  it('builds encoded protocol-relative urls without throwing', () => {
    const fileSystem = new XpFileSystem(
      permission,
      '/tmp',
      '//localhost:3000/api/sandbox/volume/knowledges/test'
    )

    expect(fileSystem.fullUrl('Claude Code/source map.pdf')).toBe(
      '//localhost:3000/api/sandbox/volume/knowledges/test/Claude%20Code/source%20map.pdf'
    )
  })

  it('returns the generated file url when writing with a protocol-relative base url', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xp-file-system-'))
    const fileSystem = new XpFileSystem(
      permission,
      tempDir,
      '//localhost:3000/api/sandbox/volume/knowledges/test'
    )

    const url = await fileSystem.writeFile('folder/hello world.txt', 'content')

    expect(url).toBe('//localhost:3000/api/sandbox/volume/knowledges/test/folder/hello%20world.txt')
    await expect(fsPromises.readFile(path.join(tempDir, 'folder', 'hello world.txt'), 'utf8')).resolves.toBe(
      'content'
    )
  })
})
