import { createHash } from 'node:crypto'
import { mkdtemp, rm, symlink, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { KnowledgeUploadSessionsService } from './knowledge-upload-sessions.service'
import { VolumeHandle, type VolumeScope } from '../../shared/volume/volume'

jest.mock('../knowledgebase.service', () => ({ KnowledgebaseService: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentTenantId: () => 'tenant' },
    RuntimeCapabilityProvider: () => () => undefined,
    SandboxWorkspaceMapperStrategy: () => () => undefined
}))
const kb = '11111111-1111-4111-8111-111111111111'
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
describe('Knowledge resumable uploads', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'knowledge-upload-'))
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
    function fixture() {
        const knowledge = { assertKnowledgebaseWriteAccess: jest.fn(), assertNotRebuilding: jest.fn() }
        const volumes = {
            resolve: (scope: VolumeScope) => new VolumeHandle(scope, root, root, 'http://unused'),
            resolveRoot: () => ({ serverRoot: root, hostRoot: root })
        }
        return { knowledge, service: new KnowledgeUploadSessionsService(knowledge as never, volumes) }
    }
    it('retains out-of-order parts across service restarts, accepts identical retries and reads across parts', async () => {
        const f = fixture(),
            first = Buffer.alloc(4 * 1024 ** 2, 9),
            last = Buffer.from('last part')
        const session = await f.service.create({
            knowledgebaseId: kb,
            name: '图库.zip',
            size: first.length + last.length
        })
        const identity = { knowledgebaseId: kb, sessionId: session.id }
        await f.service.append({ ...identity, index: 1, buffer: last, sha256: digest(last) })
        const restarted = fixture().service
        expect((await restarted.status(identity)).received).toEqual([1])
        await expect(restarted.complete(identity)).rejects.toThrow()
        await restarted.append({ ...identity, index: 0, buffer: first, sha256: digest(first) })
        await restarted.append({ ...identity, index: 0, buffer: first, sha256: digest(first) })
        const completed = await restarted.complete(identity)
        expect(completed.complete).toBe(true)
        expect(completed.partHashes['0']).toBe(digest(first))
        expect(completed.sha256).toBe(digest(Buffer.concat([first, last])))
        expect(await restarted.read({ ...identity, offset: first.length - 2, length: 6 })).toEqual(
            Buffer.concat([first.subarray(-2), last.subarray(0, 4)])
        )
        const altered = Buffer.alloc(first.length, 7)
        await expect(
            restarted.append({ ...identity, index: 0, buffer: altered, sha256: digest(altered) })
        ).rejects.toThrow('conflicts')
        await expect(restarted.read({ ...identity, offset: 0, length: first.length + 1 })).rejects.toThrow('range')
        await restarted.remove(identity)
        await expect(restarted.status(identity)).rejects.toThrow()
    })
    it('rejects unauthorized operations, invalid checksums and escaping session links', async () => {
        const f = fixture(),
            bytes = Buffer.from('zip')
        const session = await f.service.create({ knowledgebaseId: kb, name: 'a.zip', size: bytes.length })
        const identity = { knowledgebaseId: kb, sessionId: session.id }
        await expect(f.service.append({ ...identity, index: 0, buffer: bytes, sha256: 'incorrect' })).rejects.toThrow(
            'Invalid upload part'
        )
        f.knowledge.assertKnowledgebaseWriteAccess.mockRejectedValueOnce(Error('forbidden'))
        await expect(f.service.status(identity)).rejects.toThrow('forbidden')
        const external = path.join(root, 'outside-sessions')
        await mkdir(external)
        await writeFile(path.join(external, 'manifest.json'), JSON.stringify(session))
        const original = path.join(root, '.upload-sessions', session.id)
        await rm(original, { recursive: true })
        await symlink(external, original)
        await expect(f.service.status(identity)).rejects.toThrow()
    })
})
