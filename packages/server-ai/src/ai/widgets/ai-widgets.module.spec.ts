import {
    ExecutionContext,
    ForbiddenException,
    Global,
    Injectable,
    Module,
    UnauthorizedException,
    type INestApplication
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector, RouterModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    MessageWidgetProvider,
    MessageWidgetProviderRegistry,
    ORGANIZATION_METADATA_KEY,
    PLUGIN_METADATA_KEY,
    RequestContext,
    StrategyBus,
    WidgetActionProvider,
    WidgetActionProviderRegistry,
    type MessageWidgetReference
} from '@xpert-ai/plugin-sdk'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { ConversationRuntimeService } from '../../chat-conversation/conversation-runtime'
import { ConversationRuntimeModule } from '../../chat-conversation/conversation-runtime.module'
import { MessageWidgets } from '../../chat-message/widgets/message-widgets'
import { AI_ROUTE_PATH } from '../ai-route'
import { AIWidgetsModule } from './ai-widgets.module'
import { MessageWidgetActionsController } from './message-widget-actions.controller'

const providerName = '@test/widgets:review'
const action = `${providerName}.confirm`
const messageId = '00000000-0000-4000-8000-000000000001'
const reference: MessageWidgetReference = { messageId, widgetId: 'review', threadId: 'thread', provider: providerName }
const confirm = jest.fn().mockResolvedValue({ refresh: 'thread' })
const messages = { findOne: jest.fn().mockResolvedValue({ id: messageId, createdInThreadId: 'thread' }) }
const queries = { execute: jest.fn().mockResolvedValue({ id: 'conversation', threadId: 'thread' }) }
const db = {
    entityMetadatas: [],
    options: { type: 'postgres' },
    getRepository: jest.fn(() => messages),
    query: jest.fn().mockResolvedValue([reference])
}

@MessageWidgetProvider(providerName)
class ReviewCards {
    readonly visibleInRestrictedSessions = true
    async resolve(references: readonly MessageWidgetReference[]) {
        return references.map(({ messageId, widgetId }) => ({
            messageId,
            widget: {
                id: widgetId,
                type: 'component' as const,
                data: { type: 'Widget' as const, widgets: [{ name: 'review', serverActions: [action] }] }
            }
        }))
    }
}

@WidgetActionProvider(providerName)
class ReviewActions {
    readonly actions = { confirm: { execute: confirm } }
}
for (const provider of [ReviewCards, ReviewActions]) {
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@test/widgets', provider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org', provider)
}

// The production host supplies these through TypeORM and the global PluginModule.
@Global()
@Module({ providers: [{ provide: DataSource, useValue: db }, StrategyBus], exports: [DataSource, StrategyBus] })
class HostInfrastructure {}

@Injectable()
class WidgetConsumer {
    constructor(readonly widgets: MessageWidgets) {}
}

@Module({
    imports: [AIWidgetsModule, RouterModule.register([{ path: AI_ROUTE_PATH, module: HostAiModule }])],
    providers: [WidgetConsumer]
})
class HostAiModule {}

@Injectable()
class RuntimeConsumer {
    constructor(
        readonly runtime: ConversationRuntimeService,
        readonly registry: MessageWidgetProviderRegistry
    ) {}
}

@Module({ imports: [ConversationRuntimeModule], providers: [RuntimeConsumer] })
class OtherRuntimeConsumerModule {}

let binding = SecretTokenBindingType.ENTERPRISE_XPERT

@Injectable()
class AuthenticatedClientSecretGuard extends ApiKeyOrClientSecretAuthGuard {
    constructor(reflector: Reflector, queries: QueryBus) {
        super(reflector, queries)
    }

    protected override authenticateClientSecret(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{
            headers: Record<string, string>
            user?: { clientSecretBindingType: SecretTokenBindingType }
        }>()
        if (request.headers['x-client-secret'] !== 'cs-x-widget-test') throw new UnauthorizedException()
        request.user = { clientSecretBindingType: binding }
        return true
    }
}

describe('AIWidgetsModule', () => {
    let app: INestApplication
    let origin: string
    const path = `/threads/thread/messages/${messageId}/widgets/review/actions/${encodeURIComponent(action)}`
    const post = (prefix = '/api/ai', fields: unknown = { title: 'Review' }, token = 'cs-x-widget-test') =>
        fetch(origin + prefix + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-client-secret': token },
            body: JSON.stringify(fields)
        })

    beforeAll(async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const module = await Test.createTestingModule({
            imports: [HostInfrastructure, HostAiModule, OtherRuntimeConsumerModule],
            providers: [ReviewCards, ReviewActions]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useClass(AuthenticatedClientSecretGuard)
            .compile()
        jest.spyOn(module.get(QueryBus), 'execute').mockImplementation(queries.execute)
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })

    beforeEach(() => {
        jest.clearAllMocks()
        binding = SecretTokenBindingType.ENTERPRISE_XPERT
    })

    afterAll(async () => {
        await app?.close()
        jest.restoreAllMocks()
    })

    it('exports card restoration and shares the existing runtime registry across consumers', async () => {
        const widgets = app.select(AIWidgetsModule).get(MessageWidgets, { strict: true })
        const runtime = app.select(ConversationRuntimeModule)
        const consumer = app.select(OtherRuntimeConsumerModule).get(RuntimeConsumer, { strict: true })
        expect(app.select(HostAiModule).get(WidgetConsumer, { strict: true }).widgets).toBe(widgets)
        expect(consumer.registry).toBe(runtime.get(MessageWidgetProviderRegistry, { strict: true }))
        expect(consumer.runtime).toBe(runtime.get(ConversationRuntimeService, { strict: true }))
        for (const token of [MessageWidgetProviderRegistry, WidgetActionProviderRegistry, MessageWidgets]) {
            const providers = app
                .get(DiscoveryService)
                .getProviders()
                .filter((provider) => provider.token === token)
            expect(providers).toHaveLength(1)
        }
        const controllers = app.get(DiscoveryService).getControllers()
        expect(controllers.filter((controller) => controller.metatype === MessageWidgetActionsController)).toHaveLength(
            1
        )
        expect(consumer.registry.findByName(providerName)).toBe(app.get(ReviewCards))
        expect(await widgets.resolve('thread', [messageId], true)).toMatchObject([
            { messageId, widget: { id: 'review' } }
        ])
    })

    it('keeps the complete API route, action dispatch, validation and credential binding', async () => {
        expect((await post('/api')).status).toBe(404)
        expect((await post('/api/ai/ai')).status).toBe(404)
        expect((await post('/api/ai', [], 'cs-x-widget-test')).status).toBe(400)
        expect((await post('/api/ai', {}, 'cs-x-invalid')).status).toBe(401)
        binding = SecretTokenBindingType.USER_CONVERSATION
        expect((await post()).status).toBe(403)
        expect(confirm).not.toHaveBeenCalled()

        binding = SecretTokenBindingType.ENTERPRISE_XPERT
        queries.execute.mockRejectedValueOnce(new ForbiddenException())
        expect((await post()).status).toBe(403)
        expect(confirm).not.toHaveBeenCalled()
        expect((await post()).status).toBe(200)
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(confirm).toHaveBeenCalledWith({
            threadId: 'thread',
            messageId,
            widgetId: 'review',
            fields: { title: 'Review' }
        })
    })

    it('propagates plugin removal to both card restoration and action dispatch', async () => {
        app.get(StrategyBus).remove('org', '@test/widgets', 'uninstall')
        expect(app.get(MessageWidgetProviderRegistry).findByName(providerName)).toBeUndefined()
        expect(app.get(WidgetActionProviderRegistry).resolve(action)).toBeUndefined()
        expect(await app.get(MessageWidgets).resolve('thread', [messageId], true)).toEqual([])
        expect((await post()).status).toBe(404)
        expect(confirm).not.toHaveBeenCalled()
    })
})
