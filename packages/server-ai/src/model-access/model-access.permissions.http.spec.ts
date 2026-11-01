jest.mock('./model-access.service', () => ({ ModelAccessService: class ModelAccessService {} }))
import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum, IUser } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { EndpointPermissionInterceptor } from '../../../server/src/shared/guards/endpoint-permission.interceptor'
import { ModelAccessController } from './model-access.controller'
import { ModelAccessService } from './model-access.service'

@Injectable()
class Identity implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: Partial<IUser> }>()
        if (!request.headers.authorization) throw new UnauthorizedException()
        request.user = {
            id: 'user',
            tenantId: 'tenant',
            roleId: 'role',
            role: {
                id: 'role',
                name: 'CUSTOM',
                rolePermissions: request.headers['x-review']
                    ? [
                          {
                              tenantId: 'tenant',
                              roleId: 'role',
                              role: { id: 'role', name: 'CUSTOM' },
                              permission: AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT,
                              enabled: true
                          }
                      ]
                    : []
            }
        }
        return true
    }
}

describe('model access separates self-service from administrative permission', () => {
    let app: INestApplication, origin: string
    const service = {
        getCatalog: jest.fn().mockResolvedValue([]),
        findMyRequests: jest.fn().mockResolvedValue([]),
        findMyGrants: jest.fn().mockResolvedValue([]),
        findAdminRequests: jest.fn().mockResolvedValue([])
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ModelAccessController],
            providers: [Identity, { provide: ModelAccessService, useValue: service }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        const middleware = new RequestContextMiddleware()
        app.use(middleware.use.bind(middleware))
        app.useGlobalGuards(module.get(Identity))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app.close())
    it('permits authenticated self-service without granting approval rights', async () => {
        for (const path of ['catalog', 'requests/my', 'grants/my'])
            expect((await fetch(`${origin}/${path}`, { headers: { authorization: 'fixture' } })).status).toBe(200)
        expect((await fetch(`${origin}/admin/requests`, { headers: { authorization: 'fixture' } })).status).toBe(403)
        expect(service.findAdminRequests).not.toHaveBeenCalled()
    })
    it('requires authentication and permits a custom reviewer role with the declared permission', async () => {
        expect((await fetch(`${origin}/catalog`)).status).toBe(401)
        expect(
            (await fetch(`${origin}/admin/requests`, { headers: { authorization: 'fixture', 'x-review': 'true' } }))
                .status
        ).toBe(200)
    })
})
