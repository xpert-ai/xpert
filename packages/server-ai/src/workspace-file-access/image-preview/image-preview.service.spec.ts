import { ForbiddenException } from '@nestjs/common'
import { mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { VolumeHandle } from '../../shared/volume'
import { WorkspaceFileAccessService, type AuthorizedImagePreview } from '../workspace-file-access.service'
import { ImagePreviewService } from './image-preview.service'
import type { ImagePreviewRequest } from './image-preview.schema'

const input: ImagePreviewRequest = {
    hostType: 'agent',
    hostId: 'assistant',
    viewKey: 'view',
    fileKey: 'image',
    variant: 'thumbnail'
}

describe('authorized image transformation', () => {
    let root: string
    let original: Buffer
    let authorized: AuthorizedImagePreview
    let authorize: jest.Mock
    let service: ImagePreviewService
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'image-preview-'))
        original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#cc2244' } })
            .png()
            .toBuffer()
        await writeFile(path.join(root, 'image.png'), original)
        authorized = {
            volume: new VolumeHandle({ tenantId: 'tenant', catalog: 'xperts', xpertId: 'assistant' }, root, root, ''),
            relativePath: 'image.png',
            fileName: '图片.png',
            mimeType: 'image/png',
            scopeKey: 'tenant:org:user:assistant:view:file'
        }
        authorize = jest.fn(async () => authorized)
        service = new ImagePreviewService({ authorizeImagePreview: authorize } as unknown as WorkspaceFileAccessService)
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('returns a bounded WebP thumbnail and retrieves original bytes only on explicit original reads', async () => {
        const result = await service.read(input)
        const metadata = await sharp(result.bytes).metadata()
        expect(result).toMatchObject({ fileName: '图片.webp', mimeType: 'image/webp' })
        expect(metadata).toMatchObject({ width: 640, height: 480, format: 'webp' })
        expect(result.bytes.length).toBeLessThan(original.length / 2)
        const full = await service.read({ ...input, variant: 'original' })
        expect(full.bytes).toEqual(original)
        expect(full).toMatchObject({ fileName: '图片.png', mimeType: 'image/png' })
    })

    it('rechecks authority on cache hits and shares only the transformed bytes of the same file generation', async () => {
        const first = await service.read(input)
        const second = await service.read(input)
        expect(second.bytes).toBe(first.bytes)
        expect(authorize).toHaveBeenCalledTimes(2)
        authorize.mockRejectedValueOnce(new ForbiddenException())
        await expect(service.read(input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(authorize).toHaveBeenCalledTimes(3)
        authorized = { ...authorized, scopeKey: 'another-user' }
        expect((await service.read(input)).bytes).not.toBe(first.bytes)
        await writeFile(
            path.join(root, 'image.png'),
            await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#2277cc' } })
                .png()
                .toBuffer()
        )
        expect((await service.read(input)).bytes).not.toEqual(first.bytes)
    })

    it('coalesces concurrent transformations after independently authorizing each reader', async () => {
        const images = await Promise.all(Array.from({ length: 8 }, () => service.read(input)))
        expect(authorize).toHaveBeenCalledTimes(8)
        expect(images.every((image) => image.bytes === images[0].bytes)).toBe(true)
    })

    it.each(['text/html', 'image/svg+xml'])('rejects unsupported provider media types (%s)', async (mimeType) => {
        authorized.mimeType = mimeType
        await expect(service.read(input)).rejects.toMatchObject({ status: 415 })
    })

    it('rejects mislabeled content, oversized originals and corrupt files', async () => {
        authorized.mimeType = 'image/jpeg'
        await expect(service.read(input)).rejects.toMatchObject({ status: 415 })
        authorized.mimeType = 'image/png'
        await writeFile(path.join(root, 'image.png'), '<html>not an image</html>')
        await expect(service.read(input)).rejects.toMatchObject({ status: 415 })
        const file = await open(path.join(root, 'image.png'), 'r+')
        await file.truncate(50 * 1024 * 1024 + 1)
        await file.close()
        await expect(service.read({ ...input, variant: 'original' })).rejects.toMatchObject({ status: 413 })
    })

    it('rejects traversal and symlink escapes through the real Volume boundary', async () => {
        const outside = await mkdtemp(path.join(tmpdir(), 'image-outside-'))
        try {
            await writeFile(path.join(outside, 'secret.png'), original)
            await symlink(path.join(outside, 'secret.png'), path.join(root, 'escape.png'))
            authorized.relativePath = 'escape.png'
            await expect(service.read(input)).rejects.toMatchObject({ status: 404 })
            authorized.relativePath = path.relative(root, path.join(outside, 'secret.png'))
            await expect(service.read(input)).rejects.toMatchObject({ status: 404 })
        } finally {
            await rm(outside, { recursive: true, force: true })
        }
    })
})
