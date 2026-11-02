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
import { EndpointPermissionInterceptor } from '../../../../server/src/shared/guards/endpoint-permission.interceptor'
import { ResolveUserOrganizationAccessCommand } from '../../../../server/src/user-organization/commands/resolve-user-organization-access.command'
import { AIProvidersService } from '../../ai-model'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { MembershipService } from '../../membership'
import { ModelAccessService } from '../../model-access'
import { CatalogModelAccessBatchInput } from '../../model-access/model-access.types'
import { CopilotModule } from '../copilot.module'
import { CopilotService } from '../copilot.service'
import { PrimaryModelSmokeService } from '../primary-model-smoke.service'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../queries/copilot-model-find.query'
import { FindCopilotModelsHandler } from '../queries/handlers/copilot-model-find.handler'
import { CopilotRoleDefaultService } from '../role-defaults/role-default.service'

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
    let handler: FindCopilotModelsHandler
    const headers = {
        authorization: 'ordinary',
        'tenant-id': 'tenant',
        'organization-id': 'org',
        'x-scope-level': 'organization'
    }
    const id = 'c951f03c-d936-41ab-a0d4-796a627d679f'
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
        const module = await Test.createTestingModule({
            imports: [HttpCopilotModule, RouterModule.register([{ path: 'copilot', module: HttpCopilotModule }])]
        }).compile()
        handler = module.get(FindCopilotModelsHandler)
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        const middleware = new RequestContextMiddleware()
        app.use(middleware.use.bind(middleware))
        app.useGlobalGuards(module.get(Identity))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = `${await app.getUrl()}/api/copilot`
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
                    id: 'provider',
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
