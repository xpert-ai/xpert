// Cache only transformed bytes, never access decisions. Open through Volume containment
// before using a file generation as a cache key; bound decoding work and retained memory.
import {
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
    ServiceUnavailableException,
    UnsupportedMediaTypeException
} from '@nestjs/common'
import { t } from 'i18next'
import sharp from 'sharp'
import type { FileHandle } from 'node:fs/promises'
import { VolumeHandle } from '../../shared/volume'
import { WorkspaceFileAccessService } from '../workspace-file-access.service'
import type { ImagePreviewRequest } from './image-preview.schema'

const MAX_BYTES = 50 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const CACHE_BYTES = 16 * 1024 * 1024
const FORMATS = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as const
type ImagePreview = { bytes: Buffer; mimeType: string; fileName: string }
type ImageBytes = Omit<ImagePreview, 'fileName'>

@Injectable()
export class ImagePreviewService {
    private readonly cache = new Map<string, ImageBytes>()
    private cacheBytes = 0
    private readonly pending = new Map<string, Promise<ImageBytes>>()
    private active = 0
    private readonly waiting: Array<() => void> = []

    constructor(private readonly files: WorkspaceFileAccessService) {}

    async read(input: ImagePreviewRequest): Promise<ImagePreview> {
        const authorized = await this.files.authorizeImagePreview(input)
        if (!Object.values(FORMATS).some((mime) => mime === authorized.mimeType)) throw unsupported()
        const opened = await VolumeHandle.openExistingFile(authorized.volume.serverRoot, authorized.relativePath).catch(
            () => {
                throw new NotFoundException(
                    t('server-ai:Error.WorkspaceFileAccessNotFound', { defaultValue: 'Workspace file was not found.' })
                )
            }
        )
        try {
            const stat = opened.fileStat
            if (!stat.isFile()) throw unsupported()
            if (stat.size > MAX_BYTES) throw tooLarge()
            const key = JSON.stringify([
                authorized.scopeKey,
                opened.filePath,
                stat.dev,
                stat.ino,
                stat.size,
                stat.mtimeMs,
                stat.ctimeMs,
                authorized.mimeType
            ])
            let result: ImageBytes
            const cached = input.variant === 'thumbnail' ? this.cache.get(key) : undefined
            if (cached) {
                this.cache.delete(key)
                this.cache.set(key, cached)
                result = cached
            } else if (input.variant === 'thumbnail') {
                let pending = this.pending.get(key)
                if (!pending) {
                    pending = this.render(opened.fileHandle, authorized.mimeType, true).then(async (image) => {
                        const after = await opened.fileHandle.stat()
                        // An in-place writer may change the file while decoding; never cache that generation.
                        if (
                            after.size === stat.size &&
                            after.mtimeMs === stat.mtimeMs &&
                            after.ctimeMs === stat.ctimeMs
                        )
                            this.remember(key, image)
                        return image
                    })
                    this.pending.set(key, pending)
                    void pending.finally(() => this.pending.delete(key)).catch(() => undefined)
                }
                result = await pending
            } else {
                result = await this.render(opened.fileHandle, authorized.mimeType, false)
            }
            return {
                ...result,
                fileName:
                    input.variant === 'thumbnail'
                        ? `${authorized.fileName.replace(/\.[^.]+$/, '')}.webp`
                        : authorized.fileName
            }
        } finally {
            await opened.fileHandle.close()
        }
    }

    private async render(file: FileHandle, mimeType: string, thumbnail: boolean): Promise<ImageBytes> {
        await this.acquire()
        try {
            // Read one byte beyond the bound to detect files that grew after stat().
            const chunks: Buffer[] = []
            for await (const chunk of file.createReadStream({ autoClose: false, start: 0, end: MAX_BYTES })) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }
            const bytes = Buffer.concat(chunks)
            if (bytes.length > MAX_BYTES) throw tooLarge()
            const image = sharp(bytes, { animated: false, limitInputPixels: MAX_PIXELS, failOn: 'error' })
            const metadata = await image.metadata().catch(() => {
                throw unsupported()
            })
            if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw tooLarge()
            if (
                !metadata.format ||
                !(metadata.format in FORMATS) ||
                FORMATS[metadata.format as keyof typeof FORMATS] !== mimeType
            )
                throw unsupported()
            if (!thumbnail) return { bytes, mimeType }
            const output = await image
                .rotate()
                .resize({
                    width: 640,
                    height: 480,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ quality: 75 })
                .toBuffer()
                .catch(() => {
                    throw unsupported()
                })
            return { bytes: output, mimeType: 'image/webp' }
        } finally {
            const next = this.waiting.shift()
            if (next) next()
            else this.active -= 1
        }
    }

    private acquire(): Promise<void> {
        if (this.active < 2) {
            this.active += 1
            return Promise.resolve()
        }
        if (this.waiting.length >= 64)
            throw new ServiceUnavailableException(
                t('server-ai:Error.WorkspaceImagePreviewBusy', {
                    defaultValue: 'Image previews are busy. Try again shortly.'
                })
            )
        return new Promise((resolve) => this.waiting.push(resolve))
    }

    private remember(key: string, image: ImageBytes) {
        if (image.bytes.length > CACHE_BYTES) return
        while (this.cache.size && (this.cacheBytes + image.bytes.length > CACHE_BYTES || this.cache.size >= 128)) {
            const oldest = this.cache.keys().next().value!
            this.cacheBytes -= this.cache.get(oldest)!.bytes.length
            this.cache.delete(oldest)
        }
        this.cache.set(key, image)
        this.cacheBytes += image.bytes.length
    }
}

function unsupported() {
    return new UnsupportedMediaTypeException(
        t('server-ai:Error.WorkspaceImagePreviewUnsupported', {
            defaultValue: 'A supported image is required for preview.'
        })
    )
}
function tooLarge() {
    return new PayloadTooLargeException(
        t('server-ai:Error.WorkspaceImagePreviewTooLarge', { defaultValue: 'The image is too large to preview.' })
    )
}
