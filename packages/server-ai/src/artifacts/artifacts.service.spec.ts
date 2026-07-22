import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWithRequestContext, WORKSPACE_FILES_SOURCE } from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as runWithServerRequestContext } from '@xpert-ai/server-core'
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

    it('uses the fixed share URL for organization and workspace links and recomputes it on policy changes', async () => {
        const html = '<!doctype html><html><body>Private design</body></html>'
        const filePath = 'exports/private-design.html'
        writeWorkspaceFile(filePath, html)
        const api = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            userId: 'user-1'
        })
        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'design-1'
            },
            kind: 'html'
        })
        const version = await api.createArtifactVersion({
            artifactId: artifact.id,
            workspaceFileRef: workspaceRef(filePath),
            mimeType: 'text/html',
            size: Buffer.byteLength(html),
            sha256: createHash('sha256').update(html).digest('hex')
        })

        const organizationLink = await api.createArtifactLink({
            artifactId: artifact.id,
            artifactVersionId: version.id,
            versionMode: 'version',
            access: { mode: 'organization_all' }
        })
        expect(organizationLink.publicUrl).toContain(`/artifacts/share/${organizationLink.slug}`)

        const workspaceLink = await api.updateArtifactLinkAccess(organizationLink.id, {
            access: { mode: 'workspace_all' }
        })
        expect(workspaceLink.publicUrl).toContain(`/artifacts/share/${organizationLink.slug}`)

        const previewLink = await api.updateArtifactLinkAccess(organizationLink.id, {
            access: { mode: 'signed_preview', ttlSeconds: 60 }
        })
        expect(previewLink.publicUrl).toContain(`/artifacts/share/${organizationLink.slug}`)
    })

    it('rejects private link policies when the Artifact lacks the required scope binding', async () => {
        const html = '<!doctype html><html><body>Unscoped design</body></html>'
        const filePath = 'exports/unscoped-design.html'
        writeWorkspaceFile(filePath, html)
        const api = service.createScopedApi({ tenantId: 'tenant-1', userId: 'user-1' })
        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'unscoped-design'
            },
            kind: 'html'
        })
        const version = await api.createArtifactVersion({
            artifactId: artifact.id,
            workspaceFileRef: workspaceRef(filePath),
            mimeType: 'text/html',
            size: Buffer.byteLength(html),
            sha256: createHash('sha256').update(html).digest('hex')
        })

        await expect(
            api.createArtifactLink({
                artifactId: artifact.id,
                artifactVersionId: version.id,
                access: { mode: 'organization_all' }
            })
        ).rejects.toThrow('organization-scoped Artifact')
        await expect(
            api.ensureArtifactShare({
                artifactId: artifact.id,
                artifactVersionId: version.id,
                shareKey: 'readonly-default',
                access: { mode: 'workspace_all' }
            })
        ).rejects.toThrow('workspace-scoped Artifact')
        expect(linkRepository.items).toHaveLength(0)
    })

    it('creates one stable source Artifact under concurrent retries', async () => {
        const api = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1'
        })
        const input = {
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'concurrent-design'
            },
            kind: 'html' as const,
            metadata: { revision: 1 }
        }

        const [first, second] = await Promise.all([api.createArtifact(input), api.createArtifact(input)])

        expect(first.id).toBe(second.id)
        expect(artifactRepository.items).toHaveLength(1)
        await expect(
            api.findArtifactBySource({
                pluginName: input.source.pluginName,
                resourceType: input.source.resourceType,
                resourceId: input.source.resourceId
            })
        ).resolves.toEqual(expect.objectContaining({ id: first.id, metadata: { revision: 1 } }))
    })

    it('isolates management content and stable source identity by user and organization', async () => {
        const html = '<!doctype html><html><body>Live analytics</body></html>'
        const filePath = 'exports/live-analytics.html'
        writeWorkspaceFile(filePath, html)
        const ownerApi = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1'
        })
        const artifact = await ownerApi.createArtifact({
            source: {
                pluginName: '@xpert-ai/datax-live-artifacts',
                resourceType: 'live-artifact-draft',
                resourceId: 'draft-1'
            },
            kind: 'html'
        })
        const version = await ownerApi.createArtifactVersion({
            artifactId: artifact.id,
            workspaceFileRef: workspaceRef(filePath),
            mimeType: 'text/html',
            sha256: createHash('sha256').update(html).digest('hex')
        })

        await expect(
            runAsUser(
                { id: 'user-1', tenantId: 'tenant-1' },
                () =>
                    service.resolveForManagementAccess({
                        artifactId: artifact.id,
                        artifactVersionId: version.id
                    }),
                'organization-1'
            )
        ).resolves.toEqual(expect.objectContaining({ buffer: Buffer.from(html) }))
        await expect(
            runAsUser(
                { id: 'user-2', tenantId: 'tenant-1' },
                () =>
                    service.resolveForManagementAccess({
                        artifactId: artifact.id,
                        artifactVersionId: version.id
                    }),
                'organization-1'
            )
        ).rejects.toThrow('Artifact was not found')
        await expect(
            runAsUser(
                { id: 'user-1', tenantId: 'tenant-1' },
                () =>
                    service.resolveForManagementAccess({
                        artifactId: artifact.id,
                        artifactVersionId: version.id
                    }),
                'organization-2'
            )
        ).rejects.toThrow('Artifact was not found')

        const secondUserApi = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-2'
        })
        await expect(
            secondUserApi.createArtifact({
                source: {
                    pluginName: '@xpert-ai/datax-live-artifacts',
                    resourceType: 'live-artifact-draft',
                    resourceId: 'draft-1'
                },
                kind: 'html'
            })
        ).resolves.toEqual(expect.objectContaining({ userId: 'user-2' }))
        expect(artifactRepository.items).toHaveLength(2)
    })

    it('ensures Artifact versions by content key and rejects key reuse for different bytes', async () => {
        const firstPath = 'exports/idempotent-a.html'
        const secondPath = 'exports/idempotent-b.html'
        writeWorkspaceFile(firstPath, '<!doctype html><p>A</p>')
        writeWorkspaceFile(secondPath, '<!doctype html><p>B</p>')
        const api = service.createScopedApi({ tenantId: 'tenant-1', userId: 'user-1' })
        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'version-design'
            },
            kind: 'html'
        })
        const shaA = createHash('sha256').update('<!doctype html><p>A</p>').digest('hex')
        const input = {
            artifactId: artifact.id,
            idempotencyKey: shaA,
            workspaceFileRef: workspaceRef(firstPath),
            mimeType: 'text/html',
            sha256: shaA,
            setCurrent: true,
            metadata: { workingCopyRevision: 4 }
        }

        const created = await api.ensureArtifactVersion(input)
        const reused = await api.ensureArtifactVersion(input)

        expect(created.outcome).toBe('created')
        expect(reused).toEqual(expect.objectContaining({ outcome: 'reused' }))
        expect(reused.version.id).toBe(created.version.id)
        expect(reused.version.workspaceFileRef).toEqual(expect.objectContaining({ filePath: firstPath }))
        expect(await api.listArtifactVersions({ artifactId: artifact.id, idempotencyKey: shaA })).toHaveLength(1)
        await expect(
            api.ensureArtifactVersion({
                ...input,
                workspaceFileRef: workspaceRef(secondPath),
                sha256: createHash('sha256').update('<!doctype html><p>B</p>').digest('hex')
            })
        ).rejects.toThrow('different content')
    })

    it('manages one idempotent share slot across fixed, latest, and access-policy changes', async () => {
        const firstPath = 'exports/share-a.html'
        const secondPath = 'exports/share-b.html'
        writeWorkspaceFile(firstPath, '<!doctype html><p>A</p>')
        writeWorkspaceFile(secondPath, '<!doctype html><p>B</p>')
        const api = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            userId: 'user-1'
        })
        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'share-design'
            },
            kind: 'html'
        })
        const firstVersion = await api.ensureArtifactVersion({
            artifactId: artifact.id,
            idempotencyKey: 'content-a',
            workspaceFileRef: workspaceRef(firstPath),
            mimeType: 'text/html'
        })
        const fixedInput = {
            artifactId: artifact.id,
            shareKey: 'readonly-default',
            artifactVersionId: firstVersion.version.id,
            versionMode: 'version' as const,
            access: { mode: 'public_link' as const, userConfirmedPublicLink: true },
            presentation: {
                disposition: 'inline' as const,
                allowDownload: false,
                safeHtmlProfile: 'interactive' as const
            }
        }
        const fixed = await api.ensureArtifactShare(fixedInput)
        const fixedRetry = await api.ensureArtifactShare(fixedInput)
        expect(fixed.outcome).toBe('created')
        expect(fixedRetry.outcome).toBe('reused')
        expect(fixedRetry.link.publicUrl).toBe(fixed.link.publicUrl)

        const latest = await api.ensureArtifactShare({
            ...fixedInput,
            artifactVersionId: null,
            versionMode: 'latest'
        })
        expect(latest.outcome).toBe('replaced')
        expect(latest.link.publicUrl).not.toBe(fixed.link.publicUrl)
        await expect(service.resolveForPublicAccess({ slug: fixed.link.slug })).rejects.toThrow('revoked')

        await api.ensureArtifactVersion({
            artifactId: artifact.id,
            idempotencyKey: 'content-b',
            workspaceFileRef: workspaceRef(secondPath),
            mimeType: 'text/html'
        })
        const updatedLatest = await api.ensureArtifactShare({
            ...fixedInput,
            artifactVersionId: null,
            versionMode: 'latest'
        })
        expect(updatedLatest.outcome).toBe('reused')
        expect(updatedLatest.link.publicUrl).toBe(latest.link.publicUrl)

        const organization = await api.ensureArtifactShare({
            ...fixedInput,
            artifactVersionId: null,
            versionMode: 'latest',
            access: { mode: 'organization_all' }
        })
        expect(organization.outcome).toBe('replaced')
        expect(organization.link.publicUrl).not.toBe(latest.link.publicUrl)
        await expect(service.resolveForPublicAccess({ slug: latest.link.slug })).rejects.toThrow('revoked')
        expect(
            linkRepository.items.filter((link) => link.status === 'active' && link.shareKey === 'readonly-default')
        ).toHaveLength(1)
        expect(await api.revokeArtifactShare({ artifactId: artifact.id, shareKey: 'readonly-default' })).toEqual(
            expect.objectContaining({ id: organization.link.id, status: 'revoked' })
        )
        await expect(
            api.revokeArtifactShare({ artifactId: artifact.id, shareKey: 'readonly-default' })
        ).resolves.toBeNull()
    })

    it('authorizes private content from persisted organization membership and workspace read access', async () => {
        const membership = jest.fn(async () => ({ isActive: true }))
        const assertCanRead = jest.fn(async () => undefined)
        const getIfExists = jest.fn(async (id: string) => ({ id, tenantId: 'tenant-1' }))
        const authorizedService = new ArtifactsService(
            artifactRepository as never,
            versionRepository as never,
            linkRepository as never,
            accessLogRepository as never,
            {
                resolve: (scope: Record<string, unknown>) =>
                    new VolumeHandle(scope as never, volumeRoot, volumeRoot, 'https://files.test')
            } as never,
            { findMembershipByUserAndOrganization: membership } as never,
            { assertCanRead } as never,
            { getIfExists } as never
        )
        const html = '<!doctype html><html><body>Restricted design</body></html>'
        const filePath = 'exports/restricted-design.html'
        writeWorkspaceFile(filePath, html)
        const api = authorizedService.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            userId: 'owner-1'
        })
        const artifact = await api.createArtifact({
            source: {
                pluginName: '@xpert-ai/plugin-pencil',
                resourceType: 'pencil_design_viewer',
                resourceId: 'design-2'
            },
            kind: 'html'
        })
        const version = await api.createArtifactVersion({
            artifactId: artifact.id,
            workspaceFileRef: workspaceRef(filePath),
            mimeType: 'text/html',
            size: Buffer.byteLength(html),
            sha256: createHash('sha256').update(html).digest('hex')
        })
        const organizationLink = await api.createArtifactLink({
            artifactId: artifact.id,
            artifactVersionId: version.id,
            access: { mode: 'organization_all' }
        })
        const workspaceLink = await api.createArtifactLink({
            artifactId: artifact.id,
            artifactVersionId: version.id,
            access: { mode: 'workspace_all' }
        })

        const organizationContent = await runAsUser({ id: 'member-1', tenantId: 'tenant-1' }, () =>
            authorizedService.resolveForAuthenticatedAccess({ slug: organizationLink.slug })
        )
        const workspaceContent = await runAsUser({ id: 'member-1', tenantId: 'tenant-1' }, () =>
            authorizedService.resolveForAuthenticatedAccess({ slug: workspaceLink.slug })
        )

        expect(organizationContent.buffer.toString('utf8')).toBe(html)
        expect(membership).toHaveBeenCalledWith({
            organizationId: 'organization-1',
            tenantId: 'tenant-1',
            userId: 'member-1'
        })
        expect(workspaceContent.buffer.toString('utf8')).toBe(html)
        expect(assertCanRead).toHaveBeenCalledWith('workspace-1')

        const session = await runAsUser({ id: 'member-1', tenantId: 'tenant-1' }, () =>
            authorizedService.createArtifactShareSession({ slug: organizationLink.slug })
        )
        expect(session.publicUrl).toContain(`/artifacts/share/${organizationLink.slug}`)
        const access = await authorizedService.resolveAccessContextFromRequest({
            headers: { cookie: `xpert_artifact_share_session=${session.token}` }
        })
        expect(access.authenticatedUser).toEqual(expect.objectContaining({ id: 'member-1', tenantId: 'tenant-1' }))
        await expect(
            authorizedService.resolveForPublicAccess({
                slug: organizationLink.slug,
                principal: access.principal,
                authenticatedUser: access.authenticatedUser
            })
        ).resolves.toEqual(expect.objectContaining({ buffer: expect.any(Buffer) }))

        const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000)
        try {
            await expect(
                authorizedService.resolveAccessContextFromRequest({
                    headers: { cookie: `xpert_artifact_share_session=${session.token}` }
                })
            ).resolves.toEqual({ principal: {} })
        } finally {
            clock.mockRestore()
        }

        await expect(
            runAsUser({ id: 'member-1', tenantId: 'tenant-2' }, () =>
                authorizedService.resolveForAuthenticatedAccess({ slug: organizationLink.slug })
            )
        ).rejects.toThrow('do not have access')
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
        if (this.prefix === 'artifact' && !value.id) {
            const duplicate = this.items.find(
                (item) =>
                    item.tenantId === value.tenantId &&
                    item.organizationId === value.organizationId &&
                    item.userId === value.userId &&
                    item.pluginName === value.pluginName &&
                    item.resourceType === value.resourceType &&
                    item.resourceId === value.resourceId
            )
            if (duplicate) {
                throw Object.assign(new Error('duplicate key violates unique constraint'), { code: '23505' })
            }
        }
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

    createQueryBuilder() {
        const parameters: Record<string, unknown> = {}
        const builder = {
            leftJoinAndSelect: () => builder,
            where: (_expression: string, values: Record<string, unknown>) => {
                Object.assign(parameters, values)
                return builder
            },
            andWhere: (_expression: string, values: Record<string, unknown>) => {
                Object.assign(parameters, values)
                return builder
            },
            getOne: async () => {
                const item = this.items.find(
                    (candidate) =>
                        (candidate.id === parameters.idOrSlug || candidate.slug === parameters.idOrSlug) &&
                        candidate.tenantId === parameters.tenantId &&
                        (parameters.organizationId === undefined ||
                            candidate.organizationId === parameters.organizationId)
                )
                return item ? { ...item } : null
            }
        }
        return builder
    }
}

function matchesWhere(candidate: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => candidate[key] === value)
}

function runAsUser<T>(
    user: { id: string; tenantId: string },
    callback: () => Promise<T>,
    organizationId?: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const request = {
            headers: {
                'tenant-id': user.tenantId,
                ...(organizationId ? { 'organization-id': organizationId } : {})
            },
            user: user as never
        }
        runWithServerRequestContext(request, () => {
            runWithRequestContext(request as never, {} as never, () => {
                callback().then(resolve).catch(reject)
            })
        })
    })
}
