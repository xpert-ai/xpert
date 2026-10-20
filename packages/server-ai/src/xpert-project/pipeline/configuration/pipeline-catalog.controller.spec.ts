jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod/v3'
import { RequestContext, ProjectPipelineContributionRegistry } from '@xpert-ai/plugin-sdk'
import { projectPipelineConfigurationSchema, type IUser } from '@xpert-ai/contracts'
import { ProjectPipelineCatalogController } from './pipeline-catalog.controller'
import { ProjectPipelineCatalogService } from './pipeline-catalog.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineManagedStartService } from '../runtime/pipeline-managed-start.service'
import { ProjectPipelineAssistantBridgeService } from '../runtime/pipeline-assistant-bridge.service'
import { ProjectPipelineBindingsService } from './pipeline-bindings.service'
import { ProjectPipelineRuntimeBridgeService } from '../runtime/pipeline-runtime-bridge.service'

describe('Pipeline catalog HTTP and scoped configuration boundary', () => {
    let app: INestApplication, base: string
    const guards = { assertCanRead: jest.fn(), assertCanManage: jest.fn() }
    const access = { assertManage: jest.fn(), listReadable: jest.fn() },
        contributions = { listForActor: jest.fn() }
    const assistants = { resolve: jest.fn(), candidate: jest.fn() },
        launch = { configure: jest.fn() }
    const runtimes = { resolve: jest.fn(), candidates: jest.fn() }
    const actor = { userId: 'user', tenantId: 'tenant', organizationId: 'organization' }
    const assistantId = randomUUID()
    const runtimeSelection = { bindingId: randomUUID(), workspaceId: randomUUID() }
    const proposal = z
        .object({ template: z.unknown(), binding: z.unknown() })
        .parse(
            JSON.parse(
                readFileSync(
                    resolve(
                        __dirname,
                        '../../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'
                    ),
                    'utf8'
                )
            )
        )
    const configuration = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, ...proposal })
    const contribution = {
        key: 'neutral',
        configurations: [configuration],
        descriptors: [],
        forms: [
            {
                templateRef: configuration.binding.templateRef,
                description: { en_US: 'Configurable example' },
                assistantSlots: ['correctness', 'security'].map((slot) => ({ slot, label: { en_US: slot } })),
                runtimeSlots: [{ slot: 'verifier', label: { en_US: 'Verifier' } }],
                parameters: [{ key: 'automaticRepair', type: 'boolean', label: { en_US: 'Automatic repair' } }]
            }
        ]
    }
    const input = () => ({
        requestId: randomUUID(),
        contributionKey: 'neutral',
        templateRef: configuration.binding.templateRef,
        assistants: { correctness: assistantId, security: assistantId },
        runtimes: { verifier: runtimeSelection },
        parameters: { automaticRepair: false }
    })
    const post = (body: unknown) =>
        fetch(`${base}/configure`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineCatalogController],
            providers: [
                ProjectPipelineCatalogService,
                { provide: XpertProjectAccessService, useValue: guards },
                { provide: ProjectAccessRuntimeService, useValue: access },
                { provide: ProjectPipelineContributionRegistry, useValue: contributions },
                { provide: ProjectPipelineManagedStartService, useValue: launch },
                { provide: ProjectPipelineAssistantBridgeService, useValue: assistants },
                { provide: ProjectPipelineRuntimeBridgeService, useValue: runtimes },
                { provide: ProjectPipelineBindingsService, useValue: {} }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: Request, _response: Response, next: NextFunction) => {
            request.user = { id: 'user', tenantId: 'tenant' }
            next()
        })
        await app.listen(0, '127.0.0.1')
        base = `${await app.getUrl()}/project/pipelines/catalog`
    })
    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user', tenantId: 'tenant' } as IUser)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        contributions.listForActor.mockReturnValue([contribution])
        access.listReadable.mockResolvedValue([{ canManage: true, assistantIds: [assistantId] }])
        assistants.candidate.mockResolvedValue({ id: assistantId, name: 'Bound Assistant', publishedVersion: '1' })
        runtimes.candidates.mockResolvedValue([])
        launch.configure.mockResolvedValue({ bindingId: randomUUID(), revision: 1, definitionDigest: 'digest' })
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(() => app.close())
    it('returns only the actor-scoped catalog and currently runnable Project-bound Assistant choices', async () => {
        const response = await fetch(base)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            canManage: true,
            items: [{ contributionKey: 'neutral' }],
            assistants: [{ id: assistantId }]
        })
        expect(guards.assertCanRead).toHaveBeenCalledWith('project')
        expect(contributions.listForActor).toHaveBeenCalledWith(actor)
        expect(assistants.candidate).toHaveBeenCalledWith({ projectId: 'project', actor }, assistantId)
    })
    it('does not expose configuration or candidates to readers and omits revoked candidates', async () => {
        access.listReadable.mockResolvedValueOnce([{ canManage: false }])
        expect(await (await fetch(base)).json()).toEqual({ canManage: false, items: [], assistants: [] })
        expect(contributions.listForActor).not.toHaveBeenCalled()
        assistants.candidate.mockRejectedValueOnce(new ForbiddenException())
        expect(await (await fetch(base)).json()).toMatchObject({ assistants: [] })
    })
    it('negotiates metadata explicitly and preserves the previous strict catalog response', async () => {
        const legacy = await (await fetch(base)).json()
        expect(legacy).not.toHaveProperty('hostCapabilities')
        expect(await (await fetch(`${base}?protocol=1`)).json()).toMatchObject({
            hostCapabilities: { protocols: [1], features: { 'pipeline.managed': [1] } }
        })
        const modern = {
            ...configuration,
            template: {
                ...configuration.template,
                hostRequirements: { protocol: 1, features: { 'pipeline.future': 1 } }
            }
        }
        contributions.listForActor.mockReturnValue([{ ...contribution, configurations: [modern] }])
        expect(await (await fetch(base)).json()).toMatchObject({ items: [] })
        expect(await (await fetch(`${base}?protocol=1`)).json()).toMatchObject({ items: [{ configuration: modern }] })
        expect(await (await fetch(`${base}?protocol=2`)).json()).toMatchObject({
            items: [{ configuration: modern }],
            hostCapabilities: { protocols: [1] }
        })
        for (const query of ['protocol=3', 'protocol=true', 'protocol=1&features=pipeline.future'])
            expect((await fetch(`${base}?${query}`)).status).toBe(400)
    })
    it('saves a canonical server-owned configuration after live authorization, without a start call', async () => {
        const body = input()
        expect((await post(body)).status).toBe(200)
        expect(access.assertManage).toHaveBeenCalledWith({ projectId: 'project', actor })
        expect(assistants.resolve).toHaveBeenCalledTimes(1)
        expect(launch.configure).toHaveBeenCalledWith(
            { projectId: 'project', actor },
            {
                requestId: body.requestId,
                configuration: {
                    ...configuration,
                    binding: {
                        ...configuration.binding,
                        executorBindings: {
                            ...configuration.binding.executorBindings,
                            correctness: {
                                ...configuration.binding.executorBindings.correctness,
                                selectionKey: assistantId
                            },
                            verifier: {
                                ...configuration.binding.executorBindings.verifier,
                                selectionKey: runtimeSelection.bindingId,
                                workspaceId: runtimeSelection.workspaceId
                            },
                            security: { ...configuration.binding.executorBindings.security, selectionKey: assistantId }
                        }
                    }
                }
            }
        )
    })
    it('accepts only explicitly editable budget values within declared maxima, with strict HTTP validation', async () => {
        const maximum = { maxCalls: 10, maxTokens: 10000, reservationTokens: 1000 }
        expect((await post({ ...input(), nativeModelBudget: maximum })).status).toBe(400)
        const budgeted = projectPipelineConfigurationSchema.parse({
            ...configuration,
            template: {
                ...configuration.template,
                hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } }
            },
            binding: {
                ...configuration.binding,
                limits: { ...configuration.binding.limits!, nativeModelBudget: maximum }
            }
        })
        contributions.listForActor.mockReturnValue([
            {
                ...contribution,
                configurations: [budgeted],
                forms: [{ ...contribution.forms[0], nativeModelBudget: maximum }]
            }
        ])
        for (const query of ['', '?protocol=1'])
            expect(await (await fetch(`${base}${query}`)).json()).toMatchObject({ items: [] })
        expect(await (await fetch(`${base}?protocol=2`)).json()).toMatchObject({
            hostCapabilities: { protocols: [1] },
            items: [{ configuration: budgeted, form: { nativeModelBudget: maximum } }]
        })
        const chosen = { ...maximum, maxCalls: 2 }
        expect((await post({ ...input(), nativeModelBudget: chosen })).status).toBe(200)
        expect(launch.configure.mock.calls[0][1].configuration.binding.limits.nativeModelBudget).toEqual(chosen)
        launch.configure.mockClear()
        for (const nativeModelBudget of [
            undefined,
            { ...maximum, maxCalls: 11 },
            { ...maximum, actualTokens: 0 },
            { ...maximum, maxTokens: '10000' },
            { ...maximum, reservationTokens: 0 }
        ])
            expect((await post({ ...input(), nativeModelBudget })).status).toBe(400)
        expect(launch.configure).not.toHaveBeenCalled()
    })
    it.each(['actor', 'configuration', 'roleBindings'])('rejects injected %s at the HTTP pipe', async (key) => {
        expect((await post({ ...input(), [key]: {} })).status).toBe(400)
        expect(launch.configure).not.toHaveBeenCalled()
        expect(access.assertManage).not.toHaveBeenCalled()
    })
    it('rejects unknown queries, hidden parameters, missing fields, wrong types and unloaded catalogs', async () => {
        expect((await fetch(`${base}?tenantId=other`)).status).toBe(400)
        for (const parameters of [
            {},
            { automaticRepair: 'true' },
            { automaticRepair: false, repositorySelection: 'other' }
        ])
            expect((await post({ ...input(), parameters })).status).toBe(400)
        contributions.listForActor.mockReturnValue([])
        expect((await post(input())).status).toBe(400)
        expect(launch.configure).not.toHaveBeenCalled()
    })
    it('rechecks management and Assistant access on save, including after a previously valid catalog read', async () => {
        await fetch(base)
        access.assertManage.mockRejectedValueOnce(new ForbiddenException())
        expect((await post(input())).status).toBe(403)
        assistants.resolve.mockRejectedValueOnce(new ForbiddenException())
        expect((await post(input())).status).toBe(403)
        expect(launch.configure).not.toHaveBeenCalled()
    })
    it('validates Runtime forms and rechecks the selected grant before saving without starting work', async () => {
        const runtimeConfiguration = projectPipelineConfigurationSchema.parse({
            ...configuration,
            template: {
                ...configuration.template,
                roles: configuration.template.roles.map((role) =>
                    role.key === 'reviewer' ? { ...role, allowedKinds: ['runtime_binding'] } : role
                )
            },
            binding: {
                ...configuration.binding,
                executorBindings: Object.fromEntries(
                    Object.entries(configuration.binding.executorBindings!).map(([slot, executor]) => [
                        slot,
                        executor.kind === 'assistant' ? { ...executor, kind: 'runtime_binding' } : executor
                    ])
                )
            }
        })
        contributions.listForActor.mockReturnValue([
            {
                ...contribution,
                configurations: [runtimeConfiguration],
                forms: [
                    {
                        ...contribution.forms[0],
                        assistantSlots: [],
                        runtimeSlots: [...contribution.forms[0].assistantSlots, ...contribution.forms[0].runtimeSlots]
                    }
                ]
            }
        ])
        const selection = { bindingId: randomUUID(), workspaceId: randomUUID() }
        const body = {
            ...input(),
            assistants: {},
            runtimes: { correctness: selection, security: selection, verifier: runtimeSelection }
        }
        expect((await post(body)).status).toBe(200)
        expect(runtimes.resolve).toHaveBeenCalledWith(
            { projectId: 'project', actor },
            selection.bindingId,
            selection.workspaceId
        )
        launch.configure.mockClear()
        runtimes.resolve.mockRejectedValueOnce(new ForbiddenException())
        expect((await post(body)).status).toBe(403)
        expect(
            (
                await post({
                    ...body,
                    runtimes: { correctness: { ...selection, configuration: {} }, security: selection }
                })
            ).status
        ).toBe(400)
        expect((await post({ ...body, runtimes: {} })).status).toBe(400)
        expect(launch.configure).not.toHaveBeenCalled()
    })
    it('does not enumerate Runtime grants for an Assistant client-secret audience', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret'
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        expect(await (await fetch(base)).json()).toMatchObject({ runtimeBindings: [] })
        expect(runtimes.candidates).not.toHaveBeenCalled()
    })
})
