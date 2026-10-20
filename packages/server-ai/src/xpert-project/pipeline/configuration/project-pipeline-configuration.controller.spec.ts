jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RequestContext, ProjectPipelineContributionRegistry } from '@xpert-ai/plugin-sdk'
import { projectPipelineConfigurationSchema, type IUser } from '@xpert-ai/contracts'
import { ProjectPipelineConfigurationController } from './project-pipeline-configuration.controller'
import { ProjectPipelineConfigurationService } from './project-pipeline-configuration.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import type { NextFunction, Request, Response } from 'express'

describe('Project Pipeline configuration HTTP boundary', () => {
    let app: INestApplication
    let url: string
    const guardAccess = { assertCanManage: jest.fn() }
    const scopedAccess = { assertManage: jest.fn() }
    const catalog = { listForActor: jest.fn() }
    const configuration = projectPipelineConfigurationSchema.parse({
        schemaVersion: 1,
        template: {
            key: 'neutral.flow',
            version: '1.0.0',
            title: 'Neutral flow',
            executionAuthority: 'provider',
            providerRef: 'neutral.projection@1',
            subjectResolverRef: 'neutral.subject@1',
            topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
            roles: [{ key: 'owner', allowedKinds: ['human'] }],
            lanes: [{ key: 'owner', roleKey: 'owner', label: 'Owner', order: 0 }],
            stages: [{ key: 'review', label: 'Review', order: 0 }]
        },
        binding: {
            templateRef: 'neutral.flow@1.0.0',
            roleBindings: { owner: { kind: 'human', selectionKey: 'owners' } },
            parameters: {}
        }
    })
    const post = (value: unknown) =>
        fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(value)
        })

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineConfigurationController],
            providers: [
                ProjectPipelineConfigurationService,
                { provide: XpertProjectAccessService, useValue: guardAccess },
                { provide: ProjectAccessRuntimeService, useValue: scopedAccess },
                { provide: ProjectPipelineContributionRegistry, useValue: catalog }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: Request, _response: Response, next: NextFunction) => {
            request.user = { id: 'user', tenantId: 'tenant' }
            next()
        })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/project/pipelines/configuration/check`
    })
    beforeEach(() => {
        jest.clearAllMocks()
        guardAccess.assertCanManage.mockResolvedValue(undefined)
        scopedAccess.assertManage.mockResolvedValue({ canManage: true })
        catalog.listForActor.mockReturnValue([])
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user', tenantId: 'tenant' } as IUser)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    it('uses the actual pipe and service and derives actor scope from trusted context', async () => {
        const response = await post(configuration)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ valid: false, runtimeReadiness: 'not_checked' })
        expect(guardAccess.assertCanManage).toHaveBeenCalledWith('project')
        expect(scopedAccess.assertManage).toHaveBeenCalledWith({
            projectId: 'project',
            actor: { userId: 'user', tenantId: 'tenant', organizationId: 'organization' }
        })
        expect(catalog.listForActor).toHaveBeenCalledWith({
            userId: 'user',
            tenantId: 'tenant',
            organizationId: 'organization'
        })
    })

    it.each([
        {},
        { ...configuration, actor: { tenantId: 'other' } },
        { ...configuration, schemaVersion: '1' },
        { ...configuration, binding: { ...configuration.binding, templateRef: 'neutral.flow@2.0.0' } },
        { ...configuration, template: { ...configuration.template, nodes: [] } }
    ])('rejects invalid or injected fields before service/catalog access', async (input) => {
        expect((await post(input)).status).toBe(400)
        expect(scopedAccess.assertManage).not.toHaveBeenCalled()
        expect(catalog.listForActor).not.toHaveBeenCalled()
    })

    it('returns stable semantic codes without echoing the invalid value', async () => {
        const response = await post({
            ...configuration,
            binding: { ...configuration.binding, templateRef: 'sensitive.payload@2' }
        })
        const body = await response.text()
        expect(body).toContain('TEMPLATE_VERSION_MISMATCH')
        expect(body).not.toContain('sensitive.payload')
    })
    it('reports unsupported protocol and feature versions without claiming runtime readiness', async () => {
        const response = await post({
            ...configuration,
            template: {
                ...configuration.template,
                hostRequirements: { protocol: 2, features: { 'pipeline.future': 1 } }
            }
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            valid: false,
            runtimeReadiness: 'not_checked',
            issues: expect.arrayContaining([
                expect.objectContaining({ code: 'HOST_PROTOCOL_UNSUPPORTED' }),
                expect.objectContaining({ code: 'HOST_FEATURE_UNSUPPORTED', ref: 'pipeline.future' })
            ])
        })
    })

    it('keeps the Project management guard and scoped capability authorization active', async () => {
        guardAccess.assertCanManage.mockRejectedValueOnce(new ForbiddenException())
        expect((await post(configuration)).status).toBe(403)
        expect(guardAccess.assertCanManage).toHaveBeenCalledWith('project')
        expect(scopedAccess.assertManage).not.toHaveBeenCalled()
        expect(catalog.listForActor).not.toHaveBeenCalled()
        scopedAccess.assertManage.mockRejectedValueOnce(new ForbiddenException())
        expect((await post(configuration)).status).toBe(403)
        expect(catalog.listForActor).not.toHaveBeenCalled()
    })
})
