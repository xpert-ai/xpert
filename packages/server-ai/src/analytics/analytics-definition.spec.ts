import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AnalyticsProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { UserOrganizationService } from '@xpert-ai/server-core'
import { AnalyticsDefinition, AnalyticsDefinitionVersion } from './analytics-definition.entity'
import { AnalyticsDefinitionController } from './analytics-definition.controller'
import { AnalyticsDefinitionService, definitionDigest } from './analytics-definition.service'
import { AnalyticsArtifactSources } from './analytics-sources.handlers'
import { ArtifactsService } from '../artifacts/artifacts.service'

const id = 'a1234567-1234-4234-8234-123456789012',
    versionId = 'b1234567-1234-4234-8234-123456789012',
    nextId = 'c1234567-1234-4234-8234-123456789012'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
const input = {
    name: 'Sales',
    providerId: 'file.table',
    visibility: 'private',
    options: { datasets: [{ id: 'sales', revision: 'r1', columns: [{ key: 'amount' }] }] }
}
describe('Analytics Definition publication and exact source resolution', () => {
    let app: INestApplication, service: AnalyticsDefinitionService, artifacts: AnalyticsArtifactSources
    let definition: AnalyticsDefinition, version: AnalyticsDefinitionVersion
    const membership = jest.fn(),
        validate = jest.fn(),
        findDefinition = jest.fn(),
        findVersion = jest.fn(),
        save = jest.fn(),
        lockedFind = jest.fn(),
        resolveArtifact = jest.fn()
    const provider = {
        descriptor: { id: 'file.table', name: 'Files', sourceKinds: ['definition'], operations: [] },
        configuration: { kind: 'definition', connection: 'workspace-files', schema: {} },
        validateConfiguration: validate
    }
    const artifactProvider = {
        descriptor: { id: 'workspace_script.query', sourceKinds: ['artifact'] },
        configuration: { kind: 'artifact', pluginName: 'script-plugin', resourceType: 'definition' }
    }
    const transaction = {
        create: (_entity: unknown, data: object) => data,
        save,
        findOne: lockedFind,
        findOneBy: async () => structuredClone(version)
    }
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        definition = Object.assign(new AnalyticsDefinition(), {
            id,
            ...actor,
            name: 'Sales',
            providerId: 'file.table',
            visibility: 'private',
            status: 'active',
            currentVersionId: versionId
        })
        version = Object.assign(new AnalyticsDefinitionVersion(), {
            id: versionId,
            definitionId: id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            versionNumber: 1,
            options: input.options,
            sha256: definitionDigest(input.options)
        })
        membership.mockReset().mockResolvedValue({ isActive: true })
        validate.mockReset().mockImplementation((options) => structuredClone(options))
        findDefinition.mockReset().mockImplementation(async () => structuredClone(definition))
        findVersion.mockReset().mockImplementation(async () => structuredClone(version))
        lockedFind.mockReset().mockImplementation(async () => structuredClone(definition))
        save.mockReset().mockImplementation(async (entity, value) => ({
            ...value,
            id: value.id ?? (entity === AnalyticsDefinition ? id : nextId)
        }))
        resolveArtifact.mockReset().mockResolvedValue({
            artifact: { pluginName: 'script-plugin', resourceType: 'definition' },
            version: { status: 'active', sha256: 'exact' }
        })
        const module = await Test.createTestingModule({
            controllers: [AnalyticsDefinitionController],
            providers: [
                AnalyticsDefinitionService,
                AnalyticsArtifactSources,
                {
                    provide: getRepositoryToken(AnalyticsDefinition),
                    useValue: {
                        findOneBy: findDefinition,
                        findAndCount: async () => [[definition], 1],
                        update: jest.fn()
                    }
                },
                {
                    provide: getRepositoryToken(AnalyticsDefinitionVersion),
                    useValue: { findOneBy: findVersion, findAndCount: async () => [[version], 1] }
                },
                { provide: DataSource, useValue: { transaction: (action) => action(transaction) } },
                { provide: AnalyticsProviderRegistry, useValue: { list: () => [provider, artifactProvider] } },
                { provide: UserOrganizationService, useValue: { findMembershipByUserAndOrganization: membership } },
                { provide: ArtifactsService, useValue: { resolveForManagementAccess: resolveArtifact } }
            ]
        }).compile()
        service = module.get(AnalyticsDefinitionService)
        artifacts = module.get(AnalyticsArtifactSources)
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
    })
    afterEach(async () => {
        await app.close()
        jest.restoreAllMocks()
    })
    async function request(path: string, body?: unknown) {
        const response = await fetch(`${await app.getUrl()}/analytics/definitions${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
        return { status: response.status, body: await response.json() }
    }
    it('validates real HTTP input, defaults visibility, rejects scope/unknown fields and malformed JSON options', async () => {
        const { visibility, ...defaults } = input
        const response = await request('', defaults)
        expect(response.status).toBe(201)
        expect(response.body.definition.visibility).toBe('private')
        expect(response.body.version.options).toEqual(input.options)
        for (const invalid of [
            { ...input, userId: 'owner' },
            { ...input, name: '' },
            { ...input, options: [] }
        ])
            expect((await request('', invalid)).status).toBe(400)
        expect((await request('?page=0')).status).toBe(400)
        expect((await request('?page=2&pageSize=5')).status).toBe(200)
    })
    it('keeps configuration validation read-only and redacts provider errors', async () => {
        expect((await request('/validate', input)).status).toBe(201)
        expect(save).not.toHaveBeenCalled()
        validate.mockRejectedValue(new Error('connection-password'))
        const denied = await request('/validate', input)
        expect(denied.status).toBe(400)
        expect(JSON.stringify(denied.body)).not.toContain('connection-password')
    })
    it('appends a version under row lock and rejects stale concurrent publication before writing', async () => {
        const options = { datasets: [{ id: 'sales', revision: 'r2' }] }
        const result = await service.publish(id, { expectedCurrentVersionId: versionId, options })
        expect(lockedFind).toHaveBeenCalledWith(
            AnalyticsDefinition,
            expect.objectContaining({ where: { id, ...actor }, lock: { mode: 'pessimistic_write' } })
        )
        expect(result.version.versionNumber).toBe(2)
        expect(result.version.options).toEqual(options)
        expect(version.options).toEqual(input.options)
        definition.currentVersionId = nextId
        save.mockClear()
        await expect(service.publish(id, { expectedCurrentVersionId: versionId, options })).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })
    it('requires membership and owner writes; organization visibility only grants reads', async () => {
        definition.userId = 'owner'
        await expect(service.get(id)).rejects.toThrow()
        definition.visibility = 'organization'
        expect((await service.get(id)).id).toBe(id)
        await expect(service.publish(id, { expectedCurrentVersionId: versionId, options: {} })).rejects.toThrow()
        membership.mockResolvedValue({ isActive: false })
        await expect(service.get(id)).rejects.toThrow()
        await expect(service.authorize({ ...actor, userId: 'owner' })).rejects.toThrow()
    })
    it('publishes an explicit audience through validated HTTP input and preserves it when omitted', async () => {
        const result = await request(`/${id}/versions`, {
            expectedCurrentVersionId: versionId,
            options: input.options,
            visibility: 'organization'
        })
        expect(result.status).toBe(201)
        expect(result.body.definition.visibility).toBe('organization')
        expect(
            (
                await request(`/${id}/versions`, {
                    expectedCurrentVersionId: versionId,
                    options: input.options,
                    visibility: 'public'
                })
            ).status
        ).toBe(400)
        definition.visibility = 'organization'
        expect(
            (await service.publish(id, { expectedCurrentVersionId: versionId, options: input.options })).definition
                .visibility
        ).toBe('organization')
    })
    it('revoking visibility denies existing resolved versions without changing their immutable options', async () => {
        definition.userId = 'owner'
        definition.visibility = 'organization'
        const resolved = await service.resolve(actor, { kind: 'definition', definitionId: id, versionId })
        definition.visibility = 'private'
        await expect(resolved.revalidate()).rejects.toThrow()
        expect(version.options).toEqual(input.options)
        await expect(
            service.publish(id, {
                expectedCurrentVersionId: versionId,
                options: input.options,
                visibility: 'organization'
            })
        ).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })
    it('pins exact versions, and rechecks archive, digest and membership after execution', async () => {
        const source = { kind: 'definition' as const, definitionId: id, versionId }
        const resolved = await service.resolve(actor, source)
        expect(resolved.providerIds).toEqual(['file.table'])
        expect(findVersion).toHaveBeenCalledWith({
            id: versionId,
            definitionId: id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        definition.currentVersionId = nextId
        await resolved.revalidate()
        definition.status = 'archived'
        await expect(resolved.revalidate()).rejects.toThrow()
        definition.status = 'active'
        version.options = { changed: true }
        await expect(resolved.revalidate()).rejects.toThrow()
    })
    it('uses Artifact owning ACL/digest resolver and refuses resource ownership changes', async () => {
        const source = { kind: 'artifact' as const, artifactId: id, versionId }
        const resolved = await artifacts.resolve(actor, source)
        expect(resolveArtifact).toHaveBeenCalledWith({ artifactId: id, artifactVersionId: versionId })
        expect(resolved.options).toEqual({})
        resolveArtifact.mockResolvedValue({
            artifact: { pluginName: 'other', resourceType: 'definition' },
            version: { status: 'active', sha256: 'exact' }
        })
        await expect(resolved.revalidate()).rejects.toThrow()
        resolveArtifact.mockRejectedValue(new Error('revoked'))
        await expect(artifacts.resolve(actor, source)).rejects.toThrow()
    })
})
