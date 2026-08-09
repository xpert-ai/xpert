import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { VolumeClient, VolumeHandle, VolumeRootResolution, VolumeScope } from '../../volume'
import { VolumeTargetStrategy } from './volume-target.strategy'

class InjectedVolumeClient extends VolumeClient {
    readonly scopes: VolumeScope[] = []

    constructor(private readonly root: string) {
        super()
    }

    resolve(scope: VolumeScope): VolumeHandle {
        this.scopes.push(scope)
        return new VolumeHandle(scope, this.root, this.root, 'http://localhost:3000/api/test-volume')
    }

    resolveRoot(): VolumeRootResolution {
        return { serverRoot: this.root, hostRoot: this.root }
    }
}

describe('VolumeTargetStrategy', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-volume-upload-'))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it('writes with the injected volume client used by the rest of the platform', async () => {
        const volumeClient = new InjectedVolumeClient(tempRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        const result = await strategy.upload(
            {
                name: 'purchase-order.pdf',
                originalName: 'purchase-order.pdf',
                mimeType: 'application/pdf',
                buffer: Buffer.from('pdf bytes'),
                source: { kind: 'multipart' }
            },
            {
                kind: 'volume',
                catalog: 'knowledges',
                knowledgeId: 'knowledge-1',
                folder: 'files'
            },
            {
                request: { tenantId: 'tenant-1', userId: 'user-1' }
            }
        )

        expect(volumeClient.scopes).toEqual([
            {
                tenantId: 'tenant-1',
                catalog: 'knowledges',
                knowledgeId: 'knowledge-1',
                projectId: undefined,
                rootId: undefined,
                userId: 'user-1',
                xpertId: undefined,
                isolateByUser: undefined
            }
        ])
        expect(await fsPromises.readFile(path.join(tempRoot, 'files', 'purchase-order.pdf'), 'utf8')).toBe('pdf bytes')
        expect(result.path).toBe('files/purchase-order.pdf')
        expect(result.metadata?.absolutePath).toBe(path.join(tempRoot, 'files', 'purchase-order.pdf'))
    })
})
