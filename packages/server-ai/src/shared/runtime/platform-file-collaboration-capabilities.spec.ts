import 'reflect-metadata'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
    ArtifactsRuntimeCapability,
    CollaborationRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    FileRuntimeCapability,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { Artifact } from '../../artifacts/entities'
import { CollaborationService } from '../../collaboration/collaboration.service'
import { CollaborationDocument } from '../../collaboration/entities'
import { FileRuntimeService } from '../../file-understanding/runtime/file-runtime.service'
import type { FileAssetAuthority } from '../../file-understanding/file-asset-access.service'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { RuntimeCapabilityProviderExplorer } from './runtime-capability-provider-explorer.service'

function fixture() {
    const queries = { execute: jest.fn() }
    const artifact = Object.assign(new Artifact(), {
        id: 'artifact-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        status: 'active'
    })
    const artifactRepository = { findOne: jest.fn().mockResolvedValue(artifact) }
    const artifacts = new ArtifactsService(
        artifactRepository as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
    )
    const document = Object.assign(new CollaborationDocument(), {
        id: 'document-1',
        providerKey: 'test.document',
        resourceId: 'resource-1',
        status: 'active',
        sequenceNumber: 0,
        materializedSequence: 0
    })
    const documentRepository = { findOne: jest.fn().mockResolvedValue(document) }
    const provider = { authorize: jest.fn().mockResolvedValue(true) }
    const collaboration = new CollaborationService(
        documentRepository as never,
        {} as never,
        { get: () => provider } as never
    )
    const files = new FileRuntimeService(queries as never)
    const registry = new DefaultRuntimeCapabilityRegistry()
    const explorer = new RuntimeCapabilityProviderExplorer(
        { getProviders: () => [artifacts, collaboration, files].map((instance) => ({ instance })) } as never,
        new Reflector(),
        registry
    )
    explorer.onModuleInit()
    return { registry, artifacts, collaboration, files, queries, provider, documentRepository }
}

describe('platform file and collaboration capability providers', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    })

    afterEach(() => jest.restoreAllMocks())

    it('discovers the domain instances without an Agent runtime or forwarding adapters', () => {
        const f = fixture()
        expect(f.registry.require(ArtifactsRuntimeCapability)).toBe(f.artifacts)
        expect(f.registry.require(CollaborationRuntimeCapability)).toBe(f.collaboration)
        expect(f.registry.require(FileRuntimeCapability)).toBe(f.files)
    })

    it('uses the current caller for platform artifacts and retains owner, tenant and organization checks', async () => {
        const f = fixture()
        const api = f.registry.require(ArtifactsRuntimeCapability)
        await expect(api.getArtifact('artifact-1')).resolves.toMatchObject({ id: 'artifact-1' })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('another-user')
        await expect(api.getArtifact('artifact-1')).rejects.toBeInstanceOf(NotFoundException)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('another-org')
        await expect(api.getArtifact('artifact-1')).rejects.toBeInstanceOf(NotFoundException)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('another-tenant')
        await expect(api.getArtifact('artifact-1')).rejects.toBeInstanceOf(NotFoundException)

        const scoped = f.artifacts.createScopedApi({ tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
        await expect(scoped.getArtifact('artifact-1')).resolves.toMatchObject({ id: 'artifact-1' })
    })

    it('still delegates collaboration access to the resource provider with platform or execution scope', async () => {
        const f = fixture()
        const api = f.registry.require(CollaborationRuntimeCapability)
        await expect(api.getDocument({ documentId: 'document-1' })).resolves.toMatchObject({ id: 'document-1' })
        expect(f.provider.authorize).toHaveBeenLastCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                operation: 'read',
                projectId: null
            })
        )
        const scoped = f.collaboration.createScopedApi({
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            xpertId: 'xpert-1'
        })
        await scoped.getDocument({ documentId: 'document-1' })
        expect(f.provider.authorize).toHaveBeenLastCalledWith(
            expect.objectContaining({
                projectId: 'project-1',
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1'
            })
        )
        f.provider.authorize.mockResolvedValue(false)
        await expect(api.getDocument({ documentId: 'document-1' })).rejects.toBeInstanceOf(ForbiddenException)
        await expect(scoped.getDocument({ documentId: 'document-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('isolates concurrent file APIs and never stores a conversation on the platform singleton', async () => {
        const f = fixture()
        f.queries.execute.mockResolvedValue({
            asset: { id: 'asset-1', originalName: 'tender.docx' },
            storageFile: {
                id: 'storage-1',
                fileUrl: 'https://files.test/tender.docx'
            }
        })
        const defaults = { conversationId: 'conversation-1' }
        const first = f.files.createScopedApi(defaults)
        const second = f.files.createScopedApi({ conversationId: 'conversation-2' })
        defaults.conversationId = 'changed-after-initialization'
        const platform = f.registry.require(FileRuntimeCapability)
        const input = { fileAssetId: 'asset-1' }
        const results = await Promise.all([
            first.resolveFile(input),
            second.resolveFile(input),
            platform.resolveFile(input)
        ])
        expect(results).toEqual(Array(3).fill(expect.objectContaining({ fileAssetId: 'asset-1', name: 'tender.docx' })))
        const authorities: FileAssetAuthority[] = [
            { kind: 'conversation', conversationId: 'conversation-1' },
            { kind: 'conversation', conversationId: 'conversation-2' },
            { kind: 'current-owner' }
        ]
        for (const [index, authority] of authorities.entries()) {
            expect(f.queries.execute).toHaveBeenNthCalledWith(
                index + 1,
                new ResolveAuthorizedFileAssetQuery({
                    locator: { fileAssetId: 'asset-1' },
                    authority,
                    operation: 'read'
                })
            )
        }
    })

    it('does not bypass denied FileAsset access via an input URL or storage fallback', async () => {
        const f = fixture()
        f.queries.execute.mockRejectedValue(new ForbiddenException())
        const input = { fileAssetId: 'asset-1', storageFileId: 'storage-1', url: 'https://files.test/guessed.docx' }
        await expect(f.registry.require(FileRuntimeCapability).resolveFile(input)).rejects.toBeInstanceOf(
            ForbiddenException
        )
        await expect(
            f.files.createScopedApi({ conversationId: 'conversation-1' }).resolveFile(input)
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.queries.execute).toHaveBeenCalledTimes(2)
    })
})
