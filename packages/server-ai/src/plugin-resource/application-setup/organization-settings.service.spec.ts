import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { OrganizationSettingsService } from './organization-settings.service'
import { saveOrganizationSettingsSchema, organizationSettingsSchema } from './organization-settings.schema'

const source = { kind: 'definition' as const, definitionId: 'source-a', versionId: 'v1' }
const orgMember = '5706d6be-b453-49c1-bdba-9a157942a6d9'
const outsider = 'b21605f7-a7da-4099-a973-8b7f94be430c'
const field = { id: 'actual', logicalType: 'decimal' }
const memberApp = {
    scope: 'organization',
    pluginName: 'plugin',
    appName: 'orders',
    config: { organizationSetup: [{ kind: 'members', key: 'sales' }] }
} as PluginTemplateApplicationSummary
const dataApp = {
    ...memberApp,
    config: {
        organizationSetup: [
            { kind: 'analytics', key: 'analysis', providerId: 'ontology', requiredNumericFields: ['actual'] }
        ]
    }
} as PluginTemplateApplicationSummary
const query = {
    id: 'analysis',
    source,
    providerId: 'ontology',
    operation: 'read',
    contractVersion: 1,
    parameters: [],
    payload: {},
    output: { datasetId: 'dataset', grain: [], fields: [] }
}
const settings = { revision: 0, members: { sales: [orgMember] }, queries: {} }
function fixture() {
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('actor')
    const find = jest.fn().mockResolvedValue([{ user: { id: orgMember, firstName: 'Active' } }])
    const write = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const repo = {
        findOne: jest.fn().mockResolvedValue({ id: 'instance', xpertId: 'original', status: 'ready' }),
        manager: { getRepository: () => ({ find }) },
        createQueryBuilder: () => ({ update: () => write })
    }
    const analytics = {
        list: jest.fn().mockResolvedValue([
            { source, name: 'Shared', providers: [{ id: 'ontology' }] },
            {
                source: { ...source, definitionId: 'private' },
                name: 'Private',
                providers: [{ id: 'ontology', sharing: { mode: 'owner_only' } }]
            }
        ]),
        query: jest.fn().mockResolvedValue({
            rows: [{ actual: '7.5' }],
            fields: [field],
            completeness: { scope: 'full_query_result', truncated: false }
        })
    }
    const access = { assertCanInitialize: jest.fn().mockResolvedValue(undefined) }
    const locks = { run: (_key: string, fn: () => Promise<unknown>) => fn() }
    const service = new OrganizationSettingsService(
        repo as never,
        { require: () => analytics } as never,
        access as never,
        locks as never
    )
    return { service, find, repo, write, analytics, access }
}
afterEach(() => jest.restoreAllMocks())
describe('organization-owned application setup', () => {
    it('reads members from the selected tenant and organization and rejects a foreign user', async () => {
        const { service, find } = fixture()
        await expect(service.validate(memberApp, settings)).resolves.toMatchObject({
            revision: 1,
            members: settings.members
        })
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant',
                    organizationId: 'org-a',
                    isActive: true,
                    user: expect.objectContaining({ isActive: true })
                })
            })
        )
        await expect(
            service.validate(memberApp, { ...settings, members: { sales: [outsider] } })
        ).rejects.toBeInstanceOf(BadRequestException)
    })
    it('requires initialization authority before listing members or sources', async () => {
        const { service, access, find, analytics } = fixture()
        access.assertCanInitialize.mockRejectedValue(new ForbiddenException())
        await expect(service.form(memberApp)).rejects.toBeInstanceOf(ForbiddenException)
        expect(find).not.toHaveBeenCalled()
        expect(analytics.list).not.toHaveBeenCalled()
    })
    it('backfills an installation by updating only its settings, scoped and revision-checked', async () => {
        const { service, write, repo } = fixture()
        await expect(service.complete(memberApp, settings)).resolves.toEqual({ revision: 1 })
        expect(Object.keys(write.set.mock.calls[0][0])).toEqual(['organizationSettings'])
        expect(write.where).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'instance',
                tenantId: 'tenant',
                organizationId: 'org-a',
                scopeKey: 'org-a',
                appName: 'orders'
            })
        )
        expect(write.setParameters).toHaveBeenCalledWith(expect.objectContaining({ revision: 0 }))
        repo.findOne.mockResolvedValue({
            id: 'instance',
            xpertId: 'original',
            status: 'ready',
            organizationSettings: { ...settings, revision: 2 }
        })
        await expect(service.complete(memberApp, settings)).rejects.toBeInstanceOf(ConflictException)
        expect(write.execute).toHaveBeenCalledTimes(1)
    })
    it('scopes the source and query to the current actor and rejects private, foreign and obsolete versions', async () => {
        const { service, analytics } = fixture()
        const config = { revision: 0, members: {}, queries: { analysis: query } }
        expect((await service.form(dataApp)).sources.map((s) => s.name)).toEqual(['Shared'])
        await expect(service.validate(dataApp, config)).resolves.toMatchObject({ revision: 1 })
        expect(analytics.query).toHaveBeenCalledWith(
            { tenantId: 'tenant', organizationId: 'org-a', userId: 'actor' },
            { binding: query, controls: {} }
        )
        for (const ref of [
            { ...source, definitionId: 'private' },
            { ...source, definitionId: 'other-org' },
            { ...source, versionId: 'another-version' }
        ])
            await expect(
                service.validate(dataApp, { ...config, queries: { analysis: { ...query, source: ref } } })
            ).rejects.toBeInstanceOf(BadRequestException)
        expect(analytics.query).toHaveBeenCalledTimes(1)
        analytics.query.mockResolvedValue({ rows: [], fields: [field], completeness: { truncated: true } })
        await expect(service.validate(dataApp, config)).rejects.toBeInstanceOf(BadRequestException)
    })
    it('edits members without executing unchanged queries and rechecks changes and source access', async () => {
        const { service, repo, analytics, write } = fixture()
        const app = {
            ...dataApp,
            config: {
                ...dataApp.config,
                organizationSetup: [
                    ...(dataApp.config.organizationSetup ?? []),
                    ...(memberApp.config.organizationSetup ?? [])
                ]
            }
        }
        const binding = {
            ...query,
            output: {
                ...query.output,
                fields: [
                    {
                        id: 'actual',
                        label: 'Actual',
                        sourceField: 'Actual',
                        nullable: false,
                        role: 'measure' as const,
                        logicalType: 'decimal' as const
                    }
                ]
            }
        }
        const saved = { revision: 2, members: { sales: [outsider] }, queries: { analysis: binding } }
        repo.findOne.mockResolvedValue({
            id: 'instance',
            xpertId: 'original',
            status: 'ready',
            organizationSettings: saved
        })
        const edited = { ...saved, members: { sales: [orgMember] }, queries: { analysis: structuredClone(binding) } }
        await expect(service.complete(app, edited)).resolves.toEqual({ revision: 3 })
        expect(analytics.list).toHaveBeenCalled()
        expect(analytics.query).not.toHaveBeenCalled()
        await service.validate(app, edited)
        expect(analytics.query).toHaveBeenCalledTimes(1)
        await service.complete(app, { ...edited, queries: { analysis: { ...binding, payload: { period: 'Q2' } } } })
        expect(analytics.query).toHaveBeenCalledTimes(2)
        analytics.list.mockResolvedValue([])
        await expect(service.complete(app, edited)).rejects.toBeInstanceOf(BadRequestException)
        expect(write.execute).toHaveBeenCalledTimes(2)
    })
    it('rejects unknown request scope and duplicate approvers at the HTTP schema boundary', () => {
        expect(
            saveOrganizationSettingsSchema.safeParse({
                organizationId: 'org-b',
                appName: 'app',
                pluginName: 'plugin',
                organizationSettings: settings
            }).success
        ).toBe(false)
        expect(
            organizationSettingsSchema.safeParse({ ...settings, members: { sales: [orgMember, orgMember] } }).success
        ).toBe(false)
    })
})

describe('backfilling the original published suite', () => {
    const app = {
        ...memberApp,
        config: {
            ...memberApp.config,
            assistantSuite: {
                version: '1',
                coordinatorAgentKey: 'leader',
                roles: [{ key: 'contract', templateKey: 'contract-template', primaryAgentKey: 'agent-contract' }]
            }
        }
    }
    it('reuses the unique role in the original workspace without writing an Assistant or a project', async () => {
        const { service, repo, find, write } = fixture()
        repo.findOne.mockResolvedValue({
            id: 'existing',
            xpertId: 'leader',
            status: 'ready',
            tenantId: 'tenant',
            organizationId: 'org-a',
            workspaceId: 'original-workspace',
            resourceRefs: { assistant: 'leader' }
        })
        find.mockResolvedValueOnce([{ user: { id: orgMember, firstName: 'Sales' } }]).mockResolvedValueOnce([
            {
                id: 'existing-contract',
                options: { templateSource: { pluginName: app.pluginName, templateKey: 'contract-template' } },
                agent: { key: 'agent-contract' }
            }
        ])
        await service.complete(app, settings)
        expect(find.mock.calls[1][0].where).toMatchObject({
            tenantId: 'tenant',
            organizationId: 'org-a',
            workspaceId: 'original-workspace',
            latest: true
        })
        expect(JSON.parse(write.setParameters.mock.calls[0][0].refs)).toEqual({
            assistant: 'leader',
            'role:contract': 'existing-contract'
        })
        expect(Object.keys(write.set.mock.calls[0][0]).sort()).toEqual(['organizationSettings', 'resourceRefs'])
    })
    it('rechecks degraded resources in place before restoring readiness', async () => {
        const { service, repo, write } = fixture()
        const check = jest.fn().mockResolvedValue(true)
        repo.findOne.mockResolvedValue({
            id: 'existing',
            xpertId: 'original',
            status: 'degraded',
            errorCode: 'resource_missing',
            resourceRefs: { 'role:contract': 'existing-role' }
        })
        await service.complete(app, settings, check)
        expect(check).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'existing',
                xpertId: 'original',
                resourceRefs: { 'role:contract': 'existing-role' }
            })
        )
        expect(write.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }))
    })
})
