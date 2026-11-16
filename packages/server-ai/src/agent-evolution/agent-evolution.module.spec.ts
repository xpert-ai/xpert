import { CacheModule } from '@nestjs/cache-manager'
import { Global, Module, type ModuleMetadata } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { CqrsModule } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import {
    ActorTokenRuntimeFactoryCapability,
    ConnectorRuntimeFactoryCapability,
    DefaultRuntimeCapabilityRegistry,
    ExecutionReviewRuntimeCapability,
    KnowledgeDocumentVisualAssetsRuntimeFactoryCapability,
    StrategyBus,
    XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type AgentMiddlewareRuntimeServiceApi
} from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime/middleware-runtime.module'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { AgentMiddlewareModelRuntimeService } from '../shared/agent/middleware-runtime/model-runtime.service'
import { toProjectViewAccess } from '../xpert-project/services/project-view-access'
import { ExecutionReviewService } from './execution-review/execution-review.service'
import { AgentEvolutionModule } from './agent-evolution.module'

const dataSource = {
    entityMetadatas: [],
    options: { type: 'postgres' },
    getRepository: jest.fn(() => ({}))
}

@Global()
@Module({
    imports: [CacheModule.register()],
    providers: [{ provide: DataSource, useValue: dataSource }, StrategyBus],
    exports: [CacheModule, DataSource, StrategyBus]
})
class AgentEvolutionTestInfrastructureModule {}

describe('AgentEvolutionModule', () => {
    it('imports CqrsModule so PermissionGuard can resolve CommandBus', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentEvolutionModule) as object[]

        expect(imports).toContain(CqrsModule)
    })

    it('resolves PermissionGuard with CommandBus in the real module context', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AgentEvolutionTestInfrastructureModule, AgentEvolutionModule]
        }).compile()

        expect(moduleRef.get(PermissionGuard, { strict: false })).toBeInstanceOf(PermissionGuard)
        await moduleRef.close()
    })
})

describe('execution review in the scoped middleware runtime', () => {
    let moduleRef: TestingModule
    let runtime: AgentMiddlewareRuntimeService
    const scope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'supervisor',
        xpertId: 'assistant',
        projectId: 'project'
    }
    const feature = 'customer-intent.review'
    const managerView = { feature, projectAccess: toProjectViewAccess('manager', 'active') }
    const factory = { createScopedApi: () => ({}) }
    const platform = new DefaultRuntimeCapabilityRegistry([
        [ActorTokenRuntimeFactoryCapability, factory],
        [ConnectorRuntimeFactoryCapability, factory],
        [KnowledgeDocumentVisualAssetsRuntimeFactoryCapability, factory]
    ])

    beforeAll(async () => {
        // Exercise the production module import, assembler and plugin token, isolating unrelated capabilities.
        const imports: ModuleMetadata['imports'] = Reflect.getMetadata(
            MODULE_METADATA.IMPORTS,
            AgentMiddlewareRuntimeModule
        )
        const providers: ModuleMetadata['providers'] = Reflect.getMetadata(
            MODULE_METADATA.PROVIDERS,
            AgentMiddlewareRuntimeModule
        )
        moduleRef = await Test.createTestingModule({
            imports: [
                AgentEvolutionTestInfrastructureModule,
                ...imports.filter((entry) => entry === AgentEvolutionModule)
            ],
            providers: [...providers, { provide: XPERT_RUNTIME_CAPABILITIES_TOKEN, useValue: platform }]
        })
            .overrideProvider(AgentMiddlewareModelRuntimeService)
            .useValue({})
            .useMocker((token) => (token === ExecutionReviewService ? undefined : factory))
            .compile()
        runtime = moduleRef.get(AgentMiddlewareRuntimeService)
    })
    afterAll(() => moduleRef?.close())
    afterEach(() => jest.restoreAllMocks())

    it('binds an isolated API for each owner or manager, available under the plugin SDK key', () => {
        const forView = jest.spyOn(
            moduleRef.select(AgentEvolutionModule).get(ExecutionReviewService, { strict: true }),
            'forView'
        )
        const ownerView = { feature, projectAccess: toProjectViewAccess('owner', 'active') }
        const first = runtime.createScopedApi(scope, ownerView)
        const secondScope = { ...scope, userId: 'other', projectId: 'another' }
        const second = runtime.createScopedApi(secondScope, managerView)
        expect(forView).toHaveBeenNthCalledWith(1, expect.objectContaining(scope), ownerView)
        expect(forView).toHaveBeenNthCalledWith(2, expect.objectContaining(secondScope), managerView)
        jest.isolateModules(() => {
            const sdk = jest.requireActual<typeof import('@xpert-ai/plugin-sdk')>('@xpert-ai/plugin-sdk')
            const key = sdk.ExecutionReviewRuntimeCapability
            expect(key).not.toBe(ExecutionReviewRuntimeCapability)
            expect(first.capabilities.require(key)).toBe(forView.mock.results[0].value)
            expect(second.capabilities.require(key)).toBe(forView.mock.results[1].value)
            expect(first.capabilities.require(key)).not.toBe(second.capabilities.require(key))
        })
        expect(platform.has(ExecutionReviewRuntimeCapability)).toBe(false)
    })

    it('keeps View grants out of ordinary Agent and plugin runtime calls', () => {
        const plugin = moduleRef.get<AgentMiddlewareRuntimeServiceApi>(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
        const supplied = { ...scope, viewHost: { type: 'agent', id: scope.xpertId } as const, ...managerView }
        expect(runtime.createScopedApi(supplied).capabilities.has(ExecutionReviewRuntimeCapability)).toBe(false)
        const api = Reflect.apply(plugin.createScopedApi, plugin, [supplied, managerView])
        expect(api.capabilities.has(ExecutionReviewRuntimeCapability)).toBe(false)
    })
})
