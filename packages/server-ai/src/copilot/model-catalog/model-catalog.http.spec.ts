import {
    CanActivate,
    ExecutionContext,
    INestApplication,
    Injectable,
    Module,
    Type,
    UnauthorizedException
} from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Reflector, RouterModule } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum, AiModelTypeEnum, FetchFrom, IUser } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { ConfigService } from '@xpert-ai/server-config'
import { I18nService } from 'nestjs-i18n'
import { EndpointPermissionInterceptor } from '../../../../server/src/shared/guards/endpoint-permission.interceptor'
import { ResolveUserOrganizationAccessCommand } from '../../../../server/src/user-organization/commands/resolve-user-organization-access.command'
import { AIProvidersService } from '../../ai-model'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { CopilotProviderController } from '../../copilot-provider/copilot-provider.controller'
import { CopilotProviderService } from '../../copilot-provider/copilot-provider.service'
import { CopilotProviderModelService } from '../../copilot-provider/models/copilot-provider-model.service'
import { CopilotProviderModelParameterRulesQuery } from '../../copilot-provider/queries/model-parameter-rules.query'
import { CopilotProviderModelParameterRulesHandler } from '../../copilot-provider/queries/handlers/model-parameter-rules.handler'
import { MembershipService } from '../../membership'
import { ModelAccessService } from '../../model-access'
import { CatalogModelAccessBatchInput } from '../../model-access/model-access.types'
import { CopilotModule } from '../copilot.module'
import { CopilotService } from '../copilot.service'
import { PrimaryModelSmokeService } from '../primary-model-smoke.service'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../queries/copilot-model-find.query'
import { FindCopilotModelsHandler } from '../queries/handlers/copilot-model-find.handler'
import { CopilotRoleDefaultService } from '../role-defaults/role-default.service'
import { CopilotModelCatalogService } from './model-catalog.service'

@Injectable()
class Identity implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: IUser }>()
        const token = request.headers.authorization
        if (!['ordinary', 'provider-manager', 'membership-manager', 'inactive'].includes(token)) {
            throw new UnauthorizedException()
        }
        const permission =
            token === 'provider-manager'
                ? AIPermissionsEnum.COPILOT_EDIT
                : token === 'membership-manager'
                  ? AIPermissionsEnum.MEMBERSHIP_EDIT
                  : null
        request.user = {
            id: 'user',
            tenantId: 'tenant',
            roleId: 'role',
            isActive: token !== 'inactive',
            role: {
                id: 'role',
                name: 'DATA_ENTRY',
                rolePermissions: permission
                    ? [
                          {
                              tenantId: 'tenant',
                              roleId: 'role',
                              role: { id: 'role', name: 'DATA_ENTRY' },
                              permission,
                              enabled: true
                          }
                      ]
                    : []
            }
        }
        return true
    }
}

describe('Copilot model catalog HTTP authorization boundaries', () => {
    let app: INestApplication
    let origin: string
    let providerOrigin: string
    let handler: FindCopilotModelsHandler
    let parameterHandler: CopilotProviderModelParameterRulesHandler
    const headers = {
        authorization: 'ordinary',
        'tenant-id': 'tenant',
        'organization-id': 'org',
        'x-scope-level': 'organization'
    }
    const id = 'c951f03c-d936-41ab-a0d4-796a627d679f'
    const providerId = '1731fcaa-5c8b-40ba-a372-8832b6e53568'
    const rules = [{ name: 'temperature', default: 0.2 }]
    const getParameterRules = jest.fn(() => rules)
    const providerService = {
        findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
            id: providerId,
            providerName: 'fixture',
            credentials: { api_key: 'provider-secret-fixture' }
        })
    }
    const providerModels = { findOneOrFailByWhereOptions: jest.fn().mockResolvedValue({ success: false }) }
    const service = {
        findAllEnabledCopilotsWithoutMembership: jest.fn(),
        findOne: jest.fn().mockResolvedValue({ id }),
        findOneByIdString: jest.fn().mockResolvedValue({ id }),
        upsert: jest.fn().mockResolvedValue({ id }),
        update: jest.fn().mockResolvedValue({ id }),
        delete: jest.fn().mockResolvedValue({ id }),
        softRemove: jest.fn().mockResolvedValue({ id }),
        softRecover: jest.fn().mockResolvedValue({ id })
    }
    const canUseCatalogModels = jest.fn<Promise<boolean[]>, [CatalogModelAccessBatchInput]>()
    const commands = { execute: jest.fn() }
    const queries = { execute: jest.fn() }
    const membership = { isMembershipPlanEnabled: jest.fn().mockResolvedValue(true) }
    const defaults = { resolve: jest.fn().mockResolvedValue({ configured: false, binding: null }) }
    const providers = {
        getProvider: () => ({
            getModelManager: () => ({ getParameterRules }),
            getProviderModels: (type: AiModelTypeEnum) =>
                ['allowed', 'denied'].map((model) => ({
                    model,
                    model_type: type,
                    fetch_from: FetchFrom.PREDEFINED_MODEL,
                    model_properties: {},
                    label: { en_US: model, zh_Hans: model }
                })),
            getProviderSchema: () => ({
                provider: 'fixture',
                label: { en_US: 'Fixture', zh_Hans: 'Fixture' },
                provider_credential_schema: { secret: 'schema-fixture' },
                model_credential_schema: { secret: 'model-schema-fixture' }
            })
        })
    }

    beforeAll(async () => {
        // Use the production controller list/order so dynamic CRUD routes cannot mask /models.
        const controllers: Type<unknown>[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CopilotModule)
        @Module({
            controllers,
            providers: [
                Identity,
                FindCopilotModelsHandler,
                CopilotModelCatalogService,
                CopilotProviderModelParameterRulesHandler,
                { provide: CopilotProviderService, useValue: providerService },
                { provide: CopilotProviderModelService, useValue: providerModels },
                { provide: I18nService, useValue: { t: async (key: string) => key } },
                { provide: CopilotService, useValue: service },
                { provide: QueryBus, useValue: queries },
                { provide: CommandBus, useValue: commands },
                { provide: ConfigService, useValue: { get: () => 'http://localhost' } },
                { provide: MembershipService, useValue: membership },
                { provide: CopilotRoleDefaultService, useValue: defaults },
                { provide: PrimaryModelSmokeService, useValue: {} },
                { provide: AIProvidersService, useValue: providers },
                { provide: ModelAccessService, useValue: { canUseCatalogModels } }
            ]
        })
        class HttpCopilotModule {}
        @Module({
            controllers: [CopilotProviderController],
            providers: [
                { provide: CopilotProviderService, useValue: providerService },
                { provide: CopilotProviderModelService, useValue: providerModels },
                { provide: AIProvidersService, useValue: providers },
                { provide: ConfigService, useValue: { get: () => 'http://localhost' } },
                { provide: QueryBus, useValue: queries },
                { provide: CommandBus, useValue: commands }
            ]
        })
        class HttpProviderModule {}
        const module = await Test.createTestingModule({
            imports: [
                HttpCopilotModule,
                HttpProviderModule,
                RouterModule.register([
                    { path: 'copilot', module: HttpCopilotModule },
                    { path: 'copilot-provider', module: HttpProviderModule }
                ])
            ]
        }).compile()
        handler = module.get(FindCopilotModelsHandler)
        parameterHandler = module.get(CopilotProviderModelParameterRulesHandler)
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        const middleware = new RequestContextMiddleware()
        app.use(middleware.use.bind(middleware))
        app.useGlobalGuards(module.get(Identity))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = `${await app.getUrl()}/api/copilot`
        providerOrigin = `${await app.getUrl()}/api/copilot-provider`
    })

    afterAll(async () => {
        await app?.close()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        service.findAllEnabledCopilotsWithoutMembership.mockResolvedValue([
            {
                id,
                organizationId: 'org',
                enabled: true,
                apiKey: 'copilot-secret-fixture',
                modelProvider: {
                    id: providerId,
                    providerName: 'fixture',
                    credentials: { api_key: 'provider-secret-fixture' }
                }
            }
        ])
        commands.execute.mockImplementation(async (command: unknown) => {
            if (!(command instanceof ResolveUserOrganizationAccessCommand)) throw new Error('Unexpected command')
            return command.input.organizationId === 'org' ? { id: 'user' } : null
        })
        queries.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof FindCopilotModelsQuery) return handler.execute(query)
            if (query instanceof GetCopilotProviderModelQuery) return []
            if (query instanceof CopilotProviderModelParameterRulesQuery) return parameterHandler.execute(query)
            throw new Error('Unexpected query')
        })
        canUseCatalogModels.mockImplementation(async ({ models }) =>
            models.map((model) => model.copilotModelId === 'allowed')
        )
    })

    it.each([AiModelTypeEnum.LLM, AiModelTypeEnum.TEXT_EMBEDDING, AiModelTypeEnum.RERANK])(
        'serves only authorized %s models at the original URL without management grants',
        async (type) => {
            const response = await fetch(`${origin}/models?type=${type}`, { headers })
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual([
                expect.objectContaining({
                    id,
                    providerWithModels: expect.objectContaining({
                        models: [expect.objectContaining({ model: 'allowed', model_type: type })]
                    })
                })
            ])
            expect(service.findAllEnabledCopilotsWithoutMembership).toHaveBeenCalledWith('tenant', 'org')
            expect(canUseCatalogModels).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: 'tenant',
                    organizationId: 'org',
                    userId: 'user',
                    models: expect.arrayContaining([
                        expect.objectContaining({ copilotModelId: 'denied', modelType: type })
                    ])
                })
            )
            expect(commands.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: {
                        tenantId: 'tenant',
                        organizationId: 'org',
                        userId: 'user',
                        allowServiceAccounts: true
                    }
                })
            )
            expect(service.findOne).not.toHaveBeenCalled()
            expect(service.findOneByIdString).not.toHaveBeenCalled()
        }
    )

    it('returns an empty authorized catalog as 200 []', async () => {
        canUseCatalogModels.mockImplementation(async ({ models }) => models.map(() => false))
        const response = await fetch(`${origin}/models?type=llm`, { headers })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual([])
    })

    it.each([AiModelTypeEnum.LLM, AiModelTypeEnum.TEXT_EMBEDDING, AiModelTypeEnum.RERANK])(
        'reads parameter rules for an authorized %s model without provider-management permission',
        async (modelType) => {
            const response = await fetch(
                `${origin}/models/${id}/parameter-rules?model=allowed&modelType=${modelType}`,
                { headers }
            )
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual(rules)
            expect(queries.execute).toHaveBeenCalledWith(
                new CopilotProviderModelParameterRulesQuery(providerId, modelType, 'allowed')
            )
            expect(canUseCatalogModels).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: 'tenant', organizationId: 'org', userId: 'user' })
            )
            expect(getParameterRules).toHaveBeenCalledWith('allowed', undefined)
        }
    )

    it.each(['denied', 'deleted'])(
        'denies rules for the %s model before reading provider parameters',
        async (model) => {
            const response = await fetch(`${origin}/models/${id}/parameter-rules?model=${model}&modelType=llm`, {
                headers
            })
            expect(response.status).toBe(403)
            expect(await response.json()).toMatchObject({ code: 'model_parameter_rules_forbidden' })
            expect(getParameterRules).not.toHaveBeenCalled()
            expect(providerService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
        }
    )

    it('rechecks model grants on retry instead of trusting a previously loaded catalog', async () => {
        const url = `${origin}/models/${id}/parameter-rules?model=allowed&modelType=llm`
        expect((await fetch(url, { headers })).status).toBe(200)
        canUseCatalogModels.mockImplementation(async ({ models }) => models.map(() => false))
        expect((await fetch(url, { headers })).status).toBe(403)
        expect(getParameterRules).toHaveBeenCalledTimes(1)
    })

    it('binds access to the connection as well as the model name', async () => {
        const otherId = '00000000-0000-4000-8000-000000000001'
        const response = await fetch(`${origin}/models/${otherId}/parameter-rules?model=allowed&modelType=llm`, {
            headers
        })
        expect(response.status).toBe(403)
        expect(getParameterRules).not.toHaveBeenCalled()
    })

    it('requires the exact model type even when its name matches', async () => {
        const allowedModel = { model: 'allowed', model_type: AiModelTypeEnum.LLM }
        queries.execute.mockImplementationOnce(async () => [
            { id, modelProvider: { id: providerId }, providerWithModels: { models: [allowedModel] } }
        ])
        const response = await fetch(`${origin}/models/${id}/parameter-rules?model=allowed&modelType=text-embedding`, {
            headers
        })
        expect(response.status).toBe(403)
        expect(getParameterRules).not.toHaveBeenCalled()
    })

    it.each([
        'model=allowed',
        'modelType=llm',
        'model=%20&modelType=llm',
        'model=allowed&modelType=invalid',
        'model=allowed&modelType=llm&model=denied',
        'model=allowed&modelType=llm&providerId=other',
        'model=allowed&modelType=llm&accessUserId=other',
        'model=allowed&modelType=llm&catalogMode=management'
    ])('rejects invalid or caller-controlled lookup fields: %s', async (query) => {
        const response = await fetch(`${origin}/models/${id}/parameter-rules?${query}`, { headers })
        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({ code: 'model_parameter_rules_invalid' })
        expect(queries.execute).not.toHaveBeenCalled()
    })

    it('validates the connection UUID and normalizes the model query at the HTTP boundary', async () => {
        expect(
            (await fetch(`${origin}/models/invalid/parameter-rules?model=allowed&modelType=llm`, { headers })).status
        ).toBe(406)
        expect(queries.execute).not.toHaveBeenCalled()
        expect(
            (await fetch(`${origin}/models/${id}/parameter-rules?model=%20allowed%20&modelType=llm`, { headers }))
                .status
        ).toBe(200)
        expect(getParameterRules).toHaveBeenCalledWith('allowed', undefined)
    })

    it.each([
        ['anonymous', {}, 401],
        ['disabled identity', { ...headers, authorization: 'inactive' }, 403],
        ['foreign tenant', { ...headers, 'tenant-id': 'other' }, 403],
        ['foreign organization', { ...headers, 'organization-id': 'other' }, 403],
        ['missing organization', { authorization: 'ordinary', 'x-scope-level': 'organization' }, 400]
    ])('denies parameter rules for %s before lookup', async (_name, requestHeaders, status) => {
        expect(
            (
                await fetch(`${origin}/models/${id}/parameter-rules?model=allowed&modelType=llm`, {
                    headers: requestHeaders
                })
            ).status
        ).toBe(status)
        expect(queries.execute).not.toHaveBeenCalled()
        expect(getParameterRules).not.toHaveBeenCalled()
    })

    it('supports parameter reads in tenant scope and observes organization membership revocation', async () => {
        const url = `${origin}/models/${id}/parameter-rules?model=allowed&modelType=llm`
        expect((await fetch(url, { headers: { authorization: 'ordinary', 'x-scope-level': 'tenant' } })).status).toBe(
            200
        )
        expect(canUseCatalogModels).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }))
        commands.execute.mockResolvedValueOnce(null)
        expect((await fetch(url, { headers })).status).toBe(403)
        expect(getParameterRules).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['GET', `/${providerId}`],
        ['POST', ''],
        ['PUT', `/${providerId}`],
        ['DELETE', `/${providerId}`],
        ['GET', `/${providerId}/model-parameter-rules?model=allowed&modelType=llm`],
        ['POST', `/${providerId}/model`],
        ['PUT', `/${providerId}/model/${id}`],
        ['DELETE', `/${providerId}/model/${id}`]
    ])('keeps provider management %s %s protected', async (method, path) => {
        const response = await fetch(`${providerOrigin}${path}`, { method, headers })
        expect(response.status).toBe(403)
        expect(queries.execute).not.toHaveBeenCalled()
        expect(providerService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
    })

    it('retains management parameter reads for models outside the consumer catalog', async () => {
        const response = await fetch(
            `${providerOrigin}/${providerId}/model-parameter-rules?model=denied&modelType=llm`,
            {
                headers: { ...headers, authorization: 'provider-manager' }
            }
        )
        expect(response.status).toBe(200)
        expect(getParameterRules).toHaveBeenCalledWith('denied', undefined)
        expect(canUseCatalogModels).not.toHaveBeenCalled()
    })

    it('keeps catalog mode and access identity server-controlled and strips credentials', async () => {
        const response = await fetch(
            `${origin}/models?type=llm&catalogMode=management&accessUserId=other&userId=other`,
            { headers }
        )
        expect(response.status).toBe(200)
        const body = await response.text()
        for (const secret of [
            'copilot-secret-fixture',
            'provider-secret-fixture',
            'schema-fixture',
            'model-schema-fixture'
        ]) {
            expect(body).not.toContain(secret)
        }
        expect(body).not.toContain('"denied"')
        expect(queries.execute).toHaveBeenCalledWith(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.Available)
        )
        expect(canUseCatalogModels).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user' }))
    })

    it.each([
        ['anonymous', {}, 401],
        ['disabled identity', { ...headers, authorization: 'inactive' }, 403],
        ['foreign tenant', { ...headers, 'tenant-id': 'other' }, 403],
        ['foreign organization', { ...headers, 'organization-id': 'other' }, 403],
        ['missing organization', { authorization: 'ordinary', 'x-scope-level': 'organization' }, 400],
        ['conflicting scope', { ...headers, 'x-scope-level': 'tenant' }, 400]
    ])('rejects %s before model discovery', async (_name, requestHeaders, status) => {
        const response = await fetch(`${origin}/models?type=llm`, { headers: requestHeaders })
        expect(response.status).toBe(status)
        expect(queries.execute).not.toHaveBeenCalled()
        expect(canUseCatalogModels).not.toHaveBeenCalled()
    })

    it('rechecks organization membership on every request', async () => {
        expect((await fetch(`${origin}/models?type=llm`, { headers })).status).toBe(200)
        commands.execute.mockResolvedValueOnce(null)
        expect((await fetch(`${origin}/models?type=llm`, { headers })).status).toBe(403)
        expect(canUseCatalogModels).toHaveBeenCalledTimes(1)
    })

    it('supports tenant scope without requiring an organization', async () => {
        const response = await fetch(`${origin}/models?type=llm`, {
            headers: { authorization: 'ordinary', 'x-scope-level': 'tenant' }
        })
        expect(response.status).toBe(200)
        expect(commands.execute).not.toHaveBeenCalled()
        expect(canUseCatalogModels).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant', organizationId: null, userId: 'user' })
        )
    })

    it.each([
        ['GET', '/management-models?type=llm'],
        ['GET', '/membership-models?type=llm'],
        ['GET', '/providers'],
        ['GET', `/${id}`],
        ['POST', ''],
        ['PUT', `/${id}`],
        ['DELETE', `/${id}`],
        ['DELETE', `/${id}/soft`],
        ['PUT', `/${id}/recover`],
        ['GET', '/role-defaults'],
        ['PUT', '/role-defaults']
    ])('keeps %s %s protected for ordinary users', async (method, path) => {
        const response = await fetch(`${origin}${path}`, { method, headers })
        expect(response.status).toBe(403)
        expect(queries.execute).not.toHaveBeenCalled()
        for (const operation of ['upsert', 'update', 'delete', 'softRemove', 'softRecover'] as const) {
            expect(service[operation]).not.toHaveBeenCalled()
        }
    })

    it('retains distinct provider and membership management permissions', async () => {
        const providerHeaders = { ...headers, authorization: 'provider-manager' }
        const membershipHeaders = { ...headers, authorization: 'membership-manager' }
        expect((await fetch(`${origin}/management-models?type=llm`, { headers: providerHeaders })).status).toBe(200)
        expect(queries.execute).toHaveBeenCalledWith(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.Management)
        )
        expect((await fetch(`${origin}/membership-models?type=llm`, { headers: providerHeaders })).status).toBe(403)
        expect((await fetch(`${origin}/membership-models?type=llm`, { headers: membershipHeaders })).status).toBe(200)
        expect(queries.execute).toHaveBeenCalledWith(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.MembershipManagement)
        )
        expect((await fetch(`${origin}/management-models?type=llm`, { headers: membershipHeaders })).status).toBe(403)
        expect((await fetch(`${origin}/${id}`, { method: 'DELETE', headers: providerHeaders })).status).toBe(202)
        expect(service.delete).toHaveBeenCalledWith(id)
        expect(canUseCatalogModels).not.toHaveBeenCalled()
    })
})
