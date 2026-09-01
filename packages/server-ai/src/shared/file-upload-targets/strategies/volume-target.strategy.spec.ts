import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { VolumeClient, VolumeHandle, VolumeRootResolution, VolumeScope } from '../../volume'
import { VolumeTargetStrategy } from './volume-target.strategy'

class InjectedVolumeClient extends VolumeClient {
    readonly scopes: VolumeScope[] = []

    constructor(
        private readonly root: string,
        private readonly provisioningRoot: string = root
    ) {
        super()
    }

    resolve(scope: VolumeScope): VolumeHandle {
        this.scopes.push(scope)
        return new VolumeHandle(
            scope,
            this.root,
            this.root,
            'http://localhost:3000/api/test-volume',
            this.provisioningRoot
        )
    }

    resolveRoot(): VolumeRootResolution {
        return {
            serverRoot: this.root,
            hostRoot: this.root,
            serverProvisioningRoot: this.provisioningRoot
        }
    }
}

const THEME_PREVIEW_FOLDER = 'files/presentation-studio/theme-previews'

function uploadThemePreview(
    strategy: VolumeTargetStrategy,
    options?: { fileName?: string; folder?: string; content?: string }
) {
    const fileName = options?.fileName ?? 'theme-preview.png'
    return strategy.upload(
        {
            name: fileName,
            originalName: fileName,
            mimeType: 'image/png',
            buffer: Buffer.from(options?.content ?? 'preview bytes'),
            source: { kind: 'buffer' }
        },
        {
            kind: 'volume',
            catalog: 'user-xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            folder: options?.folder ?? THEME_PREVIEW_FOLDER
        },
        {
            request: { tenantId: 'tenant-1', userId: 'user-1' }
        }
    )
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

    it('creates a missing scoped volume root before the first upload', async () => {
        const platformRoot = path.join(tempRoot, 'sandbox')
        const scopeRoot = path.join(platformRoot, 'tenant-1', 'user', 'user-1', 'xpert', 'xpert-1')
        const volumeClient = new InjectedVolumeClient(scopeRoot, platformRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        await uploadThemePreview(strategy)

        await expect(
            fsPromises.readFile(path.join(scopeRoot, THEME_PREVIEW_FOLDER, 'theme-preview.png'), 'utf8')
        ).resolves.toBe('preview bytes')
    })

    it('supports concurrent first uploads into the same missing scoped volume root', async () => {
        const platformRoot = path.join(tempRoot, 'sandbox')
        const scopeRoot = path.join(platformRoot, 'tenant-1', 'user', 'user-1', 'xpert', 'xpert-1')
        const volumeClient = new InjectedVolumeClient(scopeRoot, platformRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        await Promise.all(
            ['theme01.png', 'theme02.png'].map((fileName) =>
                uploadThemePreview(strategy, { fileName, content: fileName })
            )
        )

        await expect(
            Promise.all(
                ['theme01.png', 'theme02.png'].map((fileName) =>
                    fsPromises.readFile(path.join(scopeRoot, THEME_PREVIEW_FOLDER, fileName), 'utf8')
                )
            )
        ).resolves.toEqual(['theme01.png', 'theme02.png'])
    })

    it('rejects first upload through a scoped-volume ancestor symlink', async () => {
        const tenantRoot = path.join(tempRoot, 'tenant-1')
        const privateRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-volume-root-private-'))
        await fsPromises.mkdir(path.join(tenantRoot, 'user'), { recursive: true })
        await fsPromises.symlink(privateRoot, path.join(tenantRoot, 'user', 'user-1'))
        const scopeRoot = path.join(tenantRoot, 'user', 'user-1', 'xpert', 'xpert-1')
        const volumeClient = new InjectedVolumeClient(scopeRoot, tempRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        try {
            await expect(uploadThemePreview(strategy, { content: 'must stay isolated' })).rejects.toMatchObject({
                message: expect.any(String)
            })
            await expect(
                fsPromises.readFile(path.join(privateRoot, 'xpert/xpert-1', THEME_PREVIEW_FOLDER, 'theme-preview.png'))
            ).rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fsPromises.rm(privateRoot, { recursive: true, force: true })
        }
    })

    it('rejects a scoped-volume root symlink to another scope in the same tenant', async () => {
        const platformRoot = path.join(tempRoot, 'sandbox')
        const tenantRoot = path.join(platformRoot, 'tenant-1')
        const scopeRoot = path.join(tenantRoot, 'user', 'user-1', 'xpert', 'xpert-1')
        const siblingRoot = path.join(tenantRoot, 'user', 'user-2', 'xpert', 'xpert-2')
        await fsPromises.mkdir(path.dirname(scopeRoot), { recursive: true })
        await fsPromises.mkdir(siblingRoot, { recursive: true })
        await fsPromises.symlink(siblingRoot, scopeRoot)
        const strategy = new VolumeTargetStrategy(new InjectedVolumeClient(scopeRoot, platformRoot))

        await expect(uploadThemePreview(strategy, { content: 'must not cross scopes' })).rejects.toMatchObject({
            message: expect.any(String)
        })
        await expect(
            fsPromises.readFile(path.join(siblingRoot, THEME_PREVIEW_FOLDER, 'theme-preview.png'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('rejects an escaping folder before creating a missing scoped volume root', async () => {
        const scopeRoot = path.join(tempRoot, 'user', 'user-1', 'xpert', 'xpert-1')
        const volumeClient = new InjectedVolumeClient(scopeRoot, tempRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        await expect(uploadThemePreview(strategy, { folder: '../escape' })).rejects.toThrow('Invalid relative path')
        await expect(fsPromises.stat(scopeRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('rejects uploads through a directory symlink outside the selected volume', async () => {
        const privateRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-volume-upload-private-'))
        await fsPromises.symlink(privateRoot, path.join(tempRoot, 'escape'))
        const volumeClient = new InjectedVolumeClient(tempRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        try {
            await expect(
                strategy.upload(
                    {
                        name: 'secret.txt',
                        originalName: 'secret.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('must stay isolated'),
                        source: { kind: 'multipart' }
                    },
                    {
                        kind: 'volume',
                        catalog: 'user-xperts',
                        userId: 'user-1',
                        xpertId: 'xpert-1',
                        folder: 'escape'
                    },
                    {
                        request: { tenantId: 'tenant-1', userId: 'user-1' }
                    }
                )
            ).rejects.toMatchObject({ message: expect.any(String) })
            await expect(fsPromises.readFile(path.join(privateRoot, 'secret.txt'))).rejects.toMatchObject({
                code: 'ENOENT'
            })
        } finally {
            await fsPromises.rm(privateRoot, { recursive: true, force: true })
        }
    })

    it('rejects Project content uploads through an internal symlink and omits private URLs', async () => {
        await fsPromises.mkdir(path.join(tempRoot, 'shared'), { recursive: true })
        await fsPromises.mkdir(path.join(tempRoot, 'skills'), { recursive: true })
        await fsPromises.symlink('..', path.join(tempRoot, 'shared', 'project-root'))
        const volumeClient = new InjectedVolumeClient(tempRoot)
        const strategy = new VolumeTargetStrategy(volumeClient)

        await expect(
            strategy.upload(
                {
                    name: 'SKILL.md',
                    originalName: 'SKILL.md',
                    mimeType: 'text/markdown',
                    buffer: Buffer.from('# Overwrite'),
                    source: { kind: 'multipart' }
                },
                {
                    kind: 'volume',
                    catalog: 'projects',
                    projectId: 'project-1',
                    folder: 'shared/project-root/skills/research'
                },
                {
                    request: { tenantId: 'tenant-1', userId: 'user-1' }
                }
            )
        ).rejects.toMatchObject({ message: expect.any(String) })

        const result = await strategy.upload(
            {
                name: 'report.txt',
                originalName: 'report.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from('report'),
                source: { kind: 'multipart' }
            },
            {
                kind: 'volume',
                catalog: 'projects',
                projectId: 'project-1',
                folder: 'shared'
            },
            {
                request: { tenantId: 'tenant-1', userId: 'user-1' }
            }
        )
        expect(result.url).toBeUndefined()
        expect(result.metadata?.fileUrl).toBeUndefined()
        await expect(fsPromises.readFile(path.join(tempRoot, 'shared', 'report.txt'), 'utf8')).resolves.toBe('report')
    })
})
