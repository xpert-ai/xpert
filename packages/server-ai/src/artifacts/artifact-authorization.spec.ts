import { ArtifactPersistence } from './artifact-persistence'
import { ArtifactTypesService } from './types/artifact-types.service'
import { configuredArtifactPolicies } from './testing/source-policies'
import { ContentIdentityService } from '../content-resource/content-identity.service'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { ContentResourceRequest, ProjectHumanAccess } from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from '../content-resource/content-resource.service'
import { ProjectAccessRuntimeService } from '../xpert-project/services/project-access-runtime.service'
import { ArtifactContentAccess, assertArtifactAccess } from './artifact-content-access'
import { ArtifactsService } from './artifacts.service'
import { MemoryRepository } from './testing/memory-repository'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
const source = { pluginName: 'example-plugin', resourceType: 'page', resourceId: 'page-1' }
const shared = { source, authorizationProviderKey: 'pages', scope: { projectId: 'project', userId: null } }

function fixture() {
    const artifacts = new MemoryRepository('artifact')
    const versions = new MemoryRepository('version')
    const links = new MemoryRepository('link')
    const memberships = new Map<string, ProjectHumanAccess['role']>([
        ['owner', 'owner'],
        ['editor', 'editor'],
        ['reader', 'member']
    ])
    let providerInstalled = true
    const deniedResources = new Set<string>()
    const requests: ContentResourceRequest[] = []
    // Exercise real organization/provider resolution and Project edit/manage policy;
    // repositories and the plugin's resource decisions are deterministic test fixtures.
    const resources = new ContentResourceService(
        new ContentIdentityService(
            { exists: async () => true } as never,
            {
                createQueryBuilder: () => {
                    const query = {
                        select: () => query,
                        innerJoin: () => query,
                        where: () => query,
                        getRawMany: async () => []
                    }
                    return query
                }
            } as never
        ),
        {
            get: (key: string) => {
                if (!providerInstalled || key !== 'pages') throw new Error('provider missing')
                return {
                    authorize: async (input: ContentResourceRequest) => {
                        requests.push(input)
                        if (deniedResources.has(input.resourceId)) throw new ForbiddenException()
                        return { ...input, title: 'Page', role: 'editor', canWrite: true, canManage: true }
                    }
                }
            }
        } as never,
        {} as never
    )
    const projects = new ProjectAccessRuntimeService({} as never, {} as never)
    jest.spyOn(projects, 'listReadable').mockImplementation(async ({ actor: current, projectIds }) => {
        const role = memberships.get(current.userId)
        return current.tenantId === actor.tenantId && current.organizationId === actor.organizationId && role
            ? (projectIds ?? []).map((projectId) => ({ projectId, role, canManage: role === 'owner', archived: false }))
            : []
    })
    const contentAccess = new ArtifactContentAccess(resources, projects, configuredArtifactPolicies())
    const service = new ArtifactsService(
        artifacts as never,
        versions as never,
        links as never,
        new MemoryRepository('log') as never,
        {} as never,
        {
            findMembershipByUserAndOrganization: async () => ({ isActive: true })
        } as never,
        undefined,
        undefined,
        undefined,
        contentAccess,
        configuredArtifactPolicies()
    )
    const api = (userId = 'owner') => service.createScopedApi({ ...actor, userId })
    return {
        service,
        api,
        artifacts,
        versions,
        links,
        requests,
        memberships,
        deniedResources,
        resources,
        projects,
        uninstall: () => {
            providerInstalled = false
        }
    }
}

describe('Artifact ownership and resource authorization', () => {
    it('expands only an explicitly opted-in authenticated share, retaining source ACL and draft protection', async () => {
        let allowed = false
        const policies = { authorize: jest.fn(async () => {}), allowsProjectLinkAudience: jest.fn(() => allowed) }
        const projects = {
            listReadable: jest.fn(async () => []),
            assertEdit: jest.fn(async () => {
                throw new ForbiddenException()
            })
        }
        const resources = { authorize: jest.fn(async () => {}) }
        const access = new ArtifactContentAccess(resources as never, projects as never, policies as never)
        const artifact = {
            ...source,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            projectId: 'project',
            userId: null,
            authorizationProviderKey: 'pages'
        }
        const link = { accessMode: 'organization_all' as const, versionMode: 'version' as const }
        await expect(access.assertSharedRead(artifact, actor, link)).rejects.toBeInstanceOf(ForbiddenException)
        allowed = true
        await access.assertSharedRead(artifact, actor, link)
        expect(resources.authorize).toHaveBeenCalledWith(expect.objectContaining({ operation: 'read', actor }))
        await expect(access.assert(artifact, actor, 'read')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(access.assert(artifact, actor, 'read', 'draft')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(access.assert(artifact, actor, 'write')).rejects.toBeInstanceOf(ForbiddenException)
        resources.authorize.mockRejectedValueOnce(new ForbiddenException())
        await expect(access.assertSharedRead(artifact, actor, link)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('keeps provider-protected personal artifacts owned by their user', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact({ source, authorizationProviderKey: 'pages' })
        expect(artifact).toMatchObject({
            userId: 'owner',
            resourceId: source.resourceId,
            authorizationProviderKey: 'pages'
        })
        expect(artifact).not.toHaveProperty('resourceRef')
        expect(f.requests[0]).toMatchObject({
            providerKey: 'pages',
            resourceId: source.resourceId,
            operation: 'write',
            actor
        })
        await expect(f.api('editor').getArtifact(artifact.id)).rejects.toBeInstanceOf(NotFoundException)
        await expect(f.api('editor').findArtifactBySource(source)).resolves.toBeNull()
        const other = await f.api('editor').createArtifact({ source, authorizationProviderKey: 'pages' })
        expect(other.id).not.toBe(artifact.id)
        expect(other.userId).toBe('editor')
    })

    it('reuses explicit Project ownership across editors and retains the actual creator', async () => {
        const f = fixture()
        const [first, second] = await Promise.all([
            f.api().createArtifact(shared),
            f.api('editor').createArtifact(shared)
        ])
        expect(first.id).toBe(second.id)
        expect(f.artifacts.items).toHaveLength(1)
        expect(f.artifacts.items[0]).toMatchObject({ userId: null, projectId: 'project', createdById: 'owner' })
        await expect(f.api('editor').findArtifactBySource(source)).resolves.toMatchObject({ id: first.id })
        await expect(f.api('reader').getArtifact(first.id)).resolves.toMatchObject({ id: first.id })
        await expect(f.api('reader').createArtifact(shared)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api('outsider').getArtifact(first.id)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api('outsider').findArtifactBySource(source)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('supports Project-owned artifacts without a plugin provider, and requires projectId for explicit sharing', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact({ source, scope: shared.scope })
        await expect(f.api('editor').getArtifact(artifact.id)).resolves.toMatchObject({ id: artifact.id })
        await expect(f.api('outsider').getArtifact(artifact.id)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.requests).toHaveLength(0)
        await expect(f.api().createArtifact({ source, scope: { userId: null } })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('does not let idempotent creation remove resource ACL or move shared ownership', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact(shared)
        await expect(f.api().createArtifact({ source, scope: shared.scope })).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            f.api().createArtifact({ ...shared, scope: { projectId: 'another-project', userId: null } })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.artifacts.items[0]).toMatchObject({
            id: artifact.id,
            projectId: 'project',
            authorizationProviderKey: 'pages'
        })
    })

    it('filters resource ACL before pagination, excluding inaccessible rows from totals', async () => {
        const f = fixture()
        for (let i = 0; i < 105; i++) {
            const resourceId = `page-${i}`
            await f.api().createArtifact({ ...shared, source: { ...source, resourceId } })
            if (i % 2 === 0) f.deniedResources.add(resourceId)
        }
        const first = await f.api('reader').listArtifacts({ page: 1, pageSize: 20 })
        const last = await f.api('reader').listArtifacts({ page: 3, pageSize: 20 })
        expect(first).toMatchObject({ total: 52, page: 1, pageSize: 20 })
        expect(first.items).toHaveLength(20)
        expect(last.items).toHaveLength(12)
        expect(last.total).toBe(52)
        expect([...first.items, ...last.items].every((item) => !f.deniedResources.has(item.resourceId))).toBe(true)
        await expect(f.api('outsider').listArtifacts()).resolves.toMatchObject({ items: [], total: 0 })
    })

    it('rejects policy replacement during concurrent creation', async () => {
        const f = fixture()
        const outcomes = await Promise.allSettled([
            f.api().createArtifact(shared),
            f.api('editor').createArtifact({ source, scope: shared.scope })
        ])
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
        expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
            reason: expect.any(ForbiddenException)
        })
        expect(f.artifacts.items).toHaveLength(1)
    })

    it('fails closed on provider removal for create, read, source lookup and list', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact(shared)
        f.uninstall()
        await expect(f.api().createArtifact(shared)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api().getArtifact(artifact.id)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api().findArtifactBySource(source)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api().listArtifacts()).resolves.toMatchObject({ items: [], total: 0 })
        await expect(assertArtifactAccess(undefined, artifact, actor, 'read')).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('requires both link audience and current resource/Project permission for downloads', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact(shared)
        const stored = f.artifacts.items[0]
        const version = await f.versions.save({
            artifactId: artifact.id,
            status: 'active',
            versionNumber: 1,
            mimeType: 'text/markdown',
            workspaceFileRef: {
                source: 'platform.workspace.files',
                catalog: 'projects',
                tenantId: 'tenant',
                organizationId: 'org',
                projectId: 'project',
                filePath: 'page.md'
            }
        })
        const link = await f.links.save({
            artifact: stored,
            artifactId: artifact.id,
            artifactVersionId: version.id,
            versionMode: 'version',
            slug: 'shared-page',
            tenantId: 'tenant',
            organizationId: 'org',
            status: 'active',
            accessMode: 'organization_all',
            allowDownload: true
        })
        const readBytes = jest
            .spyOn(ArtifactPersistence.prototype, 'readWorkspaceArtifact')
            .mockResolvedValue({ buffer: Buffer.from('shared page'), name: 'page.md' })
        const input = { slug: 'shared-page', download: true, principal: { ...actor, userId: 'reader' } }
        await expect(f.service.resolveForPublicAccess(input)).resolves.toMatchObject({
            buffer: Buffer.from('shared page')
        })
        expect(readBytes).toHaveBeenCalledTimes(1)
        await expect(
            f.service.resolveForPublicAccess({ ...input, principal: { ...actor, userId: 'outsider' } })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await f.links.save({ ...link, accessMode: 'owner_only', createdById: 'owner' })
        await expect(f.service.resolveForPublicAccess(input)).rejects.toBeInstanceOf(ForbiddenException)
        // A public link cannot bypass a protected resource's authenticated ACL.
        await f.links.save({ ...link, accessMode: 'public_link' })
        await expect(f.service.resolveForPublicAccess({ slug: 'shared-page', download: true })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        f.memberships.delete('reader')
        await expect(f.service.resolveForPublicAccess(input)).rejects.toBeInstanceOf(ForbiddenException)
        f.memberships.set('reader', 'member')
        f.deniedResources.add(source.resourceId)
        await expect(f.service.resolveForPublicAccess(input)).rejects.toBeInstanceOf(ForbiddenException)
        f.deniedResources.clear()
        f.uninstall()
        await expect(f.service.resolveForPublicAccess(input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(readBytes).toHaveBeenCalledTimes(1)
        readBytes.mockRestore()
    })

    it('rejects a foreign tenant before calling the resource provider', async () => {
        const f = fixture()
        const artifact = await f.api().createArtifact({ source, authorizationProviderKey: 'pages' })
        const access = new ArtifactContentAccess(f.resources, f.projects, configuredArtifactPolicies())
        const authorize = jest.spyOn(f.resources, 'authorize')
        await expect(
            access.assert({ ...artifact, tenantId: actor.tenantId }, { ...actor, tenantId: 'foreign' }, 'read')
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(authorize).not.toHaveBeenCalled()
    })

    it('does not hide unexpected provider errors as empty lists', async () => {
        const f = fixture()
        await f.api().createArtifact(shared)
        jest.spyOn(f.resources, 'authorize').mockRejectedValue(new Error('provider unavailable'))
        await expect(f.api().listArtifacts()).rejects.toThrow('provider unavailable')
    })

    it('declares both authorization dependencies in the Nest container', async () => {
        const f = fixture()
        const module = await Test.createTestingModule({
            providers: [
                ArtifactContentAccess,
                { provide: ArtifactTypesService, useValue: configuredArtifactPolicies() },
                { provide: ContentResourceService, useValue: f.resources },
                { provide: ProjectAccessRuntimeService, useValue: f.projects }
            ]
        }).compile()
        await expect(
            module.get(ArtifactContentAccess).assert(
                {
                    ...source,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    typeBinding: {
                        pluginName: '@xpert-ai/platform',
                        resourceType: 'file',
                        scopeKey: 'builtin:global'
                    },
                    projectId: 'project',
                    userId: null
                },
                actor,
                'write'
            )
        ).resolves.toBeUndefined()
        await module.close()
    })
})
