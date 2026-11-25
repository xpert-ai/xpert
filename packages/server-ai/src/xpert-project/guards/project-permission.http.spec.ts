jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AIPermissionsEnum, type IUser, type TXpertProjectAccessRole } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { Controller, Get, HttpCode, Post, UseGuards, type INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import { RequestContextMiddleware as LegacyContextMiddleware } from '../../../../server/src/core/context/request-context.middleware'
import { EndpointPermissionInterceptor } from '../../../../server/src/shared/guards/endpoint-permission.interceptor'
import { XpertProjectAccessService } from '../services/project-access.service'
import { noAssistantPrincipal } from '../../xpert/assistant-principal/testing/no-assistant-principal.fixture'
import { ProjectPermission } from './project-permission.decorator'
import { XpertProjectPermissionGuard } from './project-permission.guard'
import { XpertProjectGuard } from './project.guard'

@Controller('projects')
@UseGuards(XpertProjectPermissionGuard)
@ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
class ProjectEndpoints {
    @Post()
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE)
    create() {
        return { ok: true }
    }

    @Get(':id')
    read() {
        return { ok: true }
    }

    @Post(':id/manage')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    manage() {
        return { ok: true }
    }
}

@Controller('project-tools')
@UseGuards(XpertProjectGuard)
class ProjectToolEndpoints {
    @Post(':id/manage')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    manage() {
        return { ok: true }
    }
}

describe('Project ACL through HTTP guards and the global permission interceptor', () => {
    let app: INestApplication, url: string
    let actor: IUser | undefined, organizationId: string
    const memberships = new Map<string, TXpertProjectAccessRole>()
    const project = { id: 'project', ownerId: 'owner', tenantId: 'tenant', organizationId: 'org', status: 'active' }
    const projects = {
        findOne: jest.fn(async ({ where }: { where: { id: string; tenantId: string; organizationId: string } }) =>
            where.id === project.id &&
            where.tenantId === project.tenantId &&
            where.organizationId === project.organizationId
                ? project
                : null
        )
    }
    const members = {
        findOne: jest.fn(
            async ({
                where
            }: {
                where: { projectId: string; userId: string; tenantId: string; organizationId: string }
            }) => {
                const role = memberships.get(where.userId)
                return role &&
                    where.projectId === project.id &&
                    where.tenantId === project.tenantId &&
                    where.organizationId === project.organizationId
                    ? { role }
                    : null
            }
        )
    }
    const selectActor = (id: string, grants: AIPermissionsEnum[] = []) => {
        actor = {
            id,
            tenantId: 'tenant',
            roleId: 'role',
            role: {
                id: 'role',
                rolePermissions: grants.map((permission) => ({
                    permission,
                    enabled: true,
                    tenantId: 'tenant',
                    roleId: 'role'
                }))
            }
        } as IUser
    }
    const manage = (prefix = 'projects') => fetch(`${url}/${prefix}/project/manage`, { method: 'POST' })

    beforeAll(async () => {
        const access = new XpertProjectAccessService(
            projects as never,
            members as never,
            {} as never,
            noAssistantPrincipal
        )
        const module = await Test.createTestingModule({
            controllers: [ProjectEndpoints, ProjectToolEndpoints],
            providers: [{ provide: XpertProjectAccessService, useValue: access }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: Request, _response: Response, next: NextFunction) => {
            request.user = actor
            request.headers['organization-id'] = organizationId
            next()
        })
        for (const middleware of [new LegacyContextMiddleware(), new RequestContextMiddleware()])
            app.use(middleware.use.bind(middleware))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        memberships.clear()
        organizationId = 'org'
        selectActor('owner')
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    it.each(['owner', 'manager'])(
        'allows the current %s without global management permission through both guard styles',
        async (id) => {
            selectActor(id)
            if (id === 'manager') memberships.set(id, 'manager')
            expect((await manage()).status).toBe(200)
            expect((await manage('project-tools')).status).toBe(200)
        }
    )
    it.each(['editor', 'member'] as const)('keeps %s read access from granting management', async (role) => {
        selectActor('member-user')
        memberships.set('member-user', role)
        expect((await fetch(`${url}/projects/project`)).status).toBe(200)
        expect((await manage()).status).toBe(403)
        expect((await manage('project-tools')).status).toBe(403)
    })
    it('denies outsiders and observes membership revocation on the next request', async () => {
        selectActor('temporary-manager')
        expect((await fetch(`${url}/projects/project`)).status).toBe(403)
        memberships.set('temporary-manager', 'manager')
        expect((await manage()).status).toBe(200)
        memberships.delete('temporary-manager')
        expect((await manage()).status).toBe(403)
    })
    it('denies missing identity and cross-tenant or cross-organization access', async () => {
        actor = undefined
        expect((await manage()).status).toBe(403)
        selectActor('owner')
        actor.tenantId = 'other-tenant'
        expect((await manage()).status).toBe(403)
        selectActor('owner')
        organizationId = 'other-org'
        expect((await manage()).status).toBe(403)
    })
    it('still requires the global create grant for collection operations', async () => {
        expect((await fetch(`${url}/projects`, { method: 'POST' })).status).toBe(403)
        selectActor('owner', [AIPermissionsEnum.XPERT_PROJECT_CREATE])
        expect((await fetch(`${url}/projects`, { method: 'POST' })).status).toBe(200)
    })
})
