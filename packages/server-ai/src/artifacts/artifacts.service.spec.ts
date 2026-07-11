import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WORKSPACE_FILES_SOURCE } from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from '../shared/volume'
import { ArtifactsService } from './artifacts.service'

describe('ArtifactsService', () => {
    let volumeRoot: string
    let artifactRepository: MemoryRepository
    let versionRepository: MemoryRepository
    let linkRepository: MemoryRepository
    let accessLogRepository: MemoryRepository
    let service: ArtifactsService

    beforeEach(() => {
        volumeRoot = mkdtempSync(path.join(tmpdir(), 'xpert-artifacts-'))
        artifactRepository = new MemoryRepository('artifact')
        versionRepository = new MemoryRepository('version')
        linkRepository = new MemoryRepository('link')
        accessLogRepository = new MemoryRepository('access-log')
        service = new ArtifactsService(
            artifactRepository as never,
            versionRepository as never,
            linkRepository as never,
            accessLogRepository as never,
            {
                resolve: (scope: Record<string, unknown>) =>
                    new VolumeHandle(scope as never, volumeRoot, volumeRoot, 'https://files.test')
            } as never
        )
    })

    afterEach(() => {
        rmSync(volumeRoot, { recursive: true, force: true })
    })

    it('rejects public artifact links without explicit user confirmation before saving a link', async () => {
        const api = service.createScopedApi({ tenantId: 'tenant-1', userId: 'user-1' })
        const artifact = await api.createArtifact({
            source: { pluginName: '@xpert-ai/plugin-demo', resourceType: 'demo', resourceId: 'demo-1' },
            kind: 'html'
        })

        await expect(
            api.createArtifactLink({
                artifactId: artifact.id,
                access: { mode: 'public_link' }
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(artifactRepository.items).toHaveLength(1)
        expect(linkRepository.items).toHaveLength(0)
    })

    it('creates a signed preview artifact link and resolves the current version with the preview token', async () => {
        const html = '<!doctype html><html><body>Artifact deck</body></html>'
        const filePath = 'exports/deck.html'
        writeWorkspaceFile(filePath, html)
        const api = service.createScopedApi({ tenantId: 'tenant-1', userId: 'user-1' })

        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-presentation-studio',
                resourceType: 'presentation_export',
                resourceId: 'export-1',
                checksum: 'deck-checksum'
            },
            kind: 'presentation',
            title: 'Deck export'
        })

        const version = await api.createArtifactVersion({
            artifactId: artifact.id,
            workspaceFileRef: workspaceRef(filePath),
            mimeType: 'text/html',
            fileName: 'deck.html',
            size: Buffer.byteLength(html),
            sha256: createHash('sha256').update(html).digest('hex'),
            sourceVersionId: 'version-1',
            checksum: 'deck-checksum'
        })

        const link = await api.createSignedPreviewLink({
            artifactId: artifact.id,
            artifactVersionId: version.id,
            versionMode: 'version',
            presentation: {
                disposition: 'inline',
                allowDownload: false,
                safeHtmlProfile: 'strict'
            },
            ttlSeconds: 60
        })

        const previewToken = new URL(link.publicUrl).searchParams.get('xpert_artifact_preview')
        const resolved = await service.resolveForPublicAccess({
            slug: link.slug,
            previewToken
        })

        expect(previewToken).toBeTruthy()
        expect(resolved.mimeType).toBe('text/html')
        expect(resolved.fileName).toBe('deck.html')
        expect(resolved.buffer.toString('utf8')).toBe(html)
        expect(linkRepository.items[0].accessCount).toBe(1)
        expect(link.slug).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/)
        expect(link.slug).not.toContain('-')
        expect(link.publicUrl).toContain(`/artifacts/share/${link.slug}`)
        expect(accessLogRepository.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event: 'access',
                    statusCode: 200
                })
            ])
        )
    })

    function writeWorkspaceFile(relativePath: string, contents: string) {
        const absolutePath = path.join(volumeRoot, relativePath)
        mkdirSync(path.dirname(absolutePath), { recursive: true })
        writeFileSync(absolutePath, contents)
    }
})

function workspaceRef(filePath: string) {
    return {
        source: WORKSPACE_FILES_SOURCE,
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'users' as const,
        scopeId: 'user-1',
        filePath,
        workspacePath: filePath,
        originalName: path.posix.basename(filePath)
    }
}

class MemoryRepository {
    readonly items: Array<Record<string, unknown>> = []
    private sequence = 0

    constructor(private readonly prefix: string) {}

    create(value: Record<string, unknown>) {
        return { ...value }
    }

    async save(value: Record<string, unknown>) {
        const entity = {
            ...value,
            id: value.id ?? `${this.prefix}-${(this.sequence += 1)}`,
            createdAt: value.createdAt ?? new Date(),
            updatedAt: new Date()
        }
        const stored = { ...entity }
        const index = this.items.findIndex((item) => item.id === entity.id)
        if (index >= 0) {
            this.items[index] = stored
        } else {
            this.items.push(stored)
        }
        return entity
    }

    async find(options: { where?: Record<string, unknown> }) {
        const where = options.where ?? {}
        return this.items.filter((candidate) => matchesWhere(candidate, where)).map((item) => ({ ...item }))
    }

    async findOne(options: {
        where?: Record<string, unknown>
        order?: Record<string, 'ASC' | 'DESC'>
        relations?: string[]
    }) {
        const where = options.where ?? {}
        let candidates = this.items.filter((candidate) => matchesWhere(candidate, where))
        if (options.order) {
            const [field, direction] = Object.entries(options.order)[0] ?? []
            if (field) {
                candidates = [...candidates].sort((left, right) => {
                    const leftValue = Number(left[field] ?? 0)
                    const rightValue = Number(right[field] ?? 0)
                    return direction === 'DESC' ? rightValue - leftValue : leftValue - rightValue
                })
            }
        }
        const item = candidates[0]
        return item ? { ...item } : null
    }

    async increment(criteria: Record<string, unknown>, field: string, amount: number) {
        const item = this.items.find((candidate) => matchesWhere(candidate, criteria))
        if (item) {
            item[field] = Number(item[field] ?? 0) + amount
        }
    }
}

function matchesWhere(candidate: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => candidate[key] === value)
}
