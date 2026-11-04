import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum, IUser } from '@xpert-ai/contracts'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { EndpointPermissionInterceptor } from '../../../../server/src/shared/guards/endpoint-permission.interceptor'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { KnowledgebaseRebuildRecoveryController } from './knowledgebase-rebuild-recovery.controller'

@Injectable()
class Identity implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: IUser }>()
        if (!request.headers.authorization) throw new UnauthorizedException()
        request.user = {
            id: 'user',
            tenantId: 'tenant',
            roleId: 'role',
            role: {
                id: 'role',
                name: 'AI_BUILDER',
                rolePermissions:
                    request.headers.authorization === 'editor'
                        ? [
                              {
                                  roleId: 'role',
                                  tenantId: 'tenant',
                                  role: { name: 'AI_BUILDER' },
                                  permission: AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
                                  enabled: true
                              }
                          ]
                        : []
            }
        }
        return true
    }
}

describe('Embedding rebuild recovery HTTP boundary', () => {
    let app: INestApplication, origin: string
    const id = 'c951f03c-d936-41ab-a0d4-796a627d679f'
    const recover = jest.fn(async () => ({
        id,
        status: 'rebuild_failed',
        organizationId: RequestContext.getOrganizationId()
    }))
    const retry = jest.fn(async (_id: string, _input: { embeddingBatchSize?: number }) => ({
        id,
        status: 'rebuilding'
    }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [KnowledgebaseRebuildRecoveryController],
            providers: [
                {
                    provide: KnowledgebaseService,
                    useValue: { recoverEmbeddingRebuild: recover, startEmbeddingRebuild: retry }
                },
                {
                    provide: CommandBus,
                    useValue: { execute: jest.fn(async () => ({ id: 'user', tenantId: 'tenant' })) }
                }
            ]
        }).compile()
        app = module.createNestApplication()
        app.use((req, res, next) => new RequestContextMiddleware().use(req, res, next))
        app.useGlobalGuards(new Identity())
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(new Reflector()))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        recover.mockClear()
        retry.mockClear()
    })
    const request = (auth: string, resource = id, body = {}) =>
        fetch(`${origin}/${resource}/recover-embedding-rebuild`, {
            method: 'POST',
            headers: {
                ...(auth ? { authorization: auth } : {}),
                'content-type': 'application/json',
                'tenant-id': 'tenant',
                'organization-id': 'org',
                'x-scope-level': 'organization'
            },
            body: JSON.stringify(body)
        })
    const retryRequest = (input: unknown, auth = 'editor') =>
        fetch(`${origin}/${id}/rebuild-embedding`, {
            method: 'POST',
            headers: {
                authorization: auth,
                'content-type': 'application/json',
                'tenant-id': 'tenant',
                'organization-id': 'org',
                'x-scope-level': 'organization'
            },
            body: JSON.stringify(input)
        })
    it('validates batch corrections without accepting client model or task overrides', async () => {
        expect((await retryRequest({ embeddingBatchSize: 8 })).status).toBe(201)
        expect(retry).toHaveBeenCalledWith(id, { embeddingBatchSize: 8 })
        retry.mockClear()
        for (const input of [
            { embeddingBatchSize: 0 },
            { embeddingBatchSize: 1.5 },
            { embeddingBatchSize: 2049 },
            { embeddingBatchSize: '10' },
            { copilotModelId: 'other' },
            { rebuildTaskId: 'other' }
        ]) {
            expect((await retryRequest(input)).status).toBe(400)
        }
        expect((await retryRequest({}, 'viewer')).status).toBe(403)
        expect(retry).not.toHaveBeenCalled()
    })
    it('retains retry compatibility for clients with no batch override', async () => {
        expect((await retryRequest(undefined)).status).toBe(201)
        expect(retry).toHaveBeenCalledWith(id, {})
    })
    it('retains the authorized organization scope', async () => {
        const response = await request('editor')
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({ id, organizationId: 'org' })
        expect(recover).toHaveBeenCalledWith(id)
    })
    it.each([
        ['', 401],
        ['viewer', 403]
    ] as const)('rejects %s before recovery', async (auth, status) => {
        expect((await request(auth)).status).toBe(status)
        expect(recover).not.toHaveBeenCalled()
    })
    it('rejects malformed IDs and client-supplied task scope', async () => {
        expect((await request('editor', 'invalid')).status).toBe(406)
        expect((await request('editor', id, { rebuildTaskId: 'other' })).status).toBe(400)
        expect(recover).not.toHaveBeenCalled()
    })
})
