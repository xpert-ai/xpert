jest.mock('../../../execution-control/execution-cancel.service', () => ({ ExecutionCancelService: class {} }))
jest.mock('../../../chat-conversation/message-checkpoint.service', () => ({ MessageCheckpointService: class {} }))
jest.mock('../../../chat-conversation/thread-run-control.service', () => ({ ThreadRunControlService: class {} }))
jest.mock('isolated-vm', () => ({ ExternalCopy: class {}, Isolate: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))
jest.mock('../../../copilot-checkpoint', () => ({ CopilotCheckpointSaver: class {} }))
jest.mock('../../agent', () => ({ createMapStreamEvents: jest.fn() }))
jest.mock('../../../environment', () => ({
    ...jest.requireActual('../../../environment/utils'),
    EnvironmentService: jest.requireActual('../../../environment/environment.service').EnvironmentService
}))
jest.mock('../../../shared', () => ({
    XpertWorkAreaResolver: class {},
    isPlanModeEnabledFromState: () => false
}))

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IUser, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Subscriber } from 'rxjs'
import { FindOneOptions, Repository } from 'typeorm'
import { Environment } from '../../../environment/environment.entity'
import { EnvironmentService } from '../../../environment/environment.service'
import { XpertWorkAreaResolver } from '../../../shared'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace/workspace-access.service'
import { XpertWorkspace } from '../../../xpert-workspace/workspace.entity'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'

// Only persistence and graph execution are fixtures; environment loading and workspace ACLs are real.
describe('Agent environment runtime authorization', () => {
    let actor: IUser
    let groupGrant: boolean
    let workspace: XpertWorkspace
    let environment: Environment
    let access: XpertWorkspaceAccessService
    let environments: EnvironmentService
    let handler: XpertAgentInvokeHandler
    let compile: jest.Mock
    let save: jest.Mock
    const graphBoundary = new Error('Environment authorized; graph compilation reached')

    beforeEach(() => {
        actor = { id: 'guest', tenantId: 'tenant', role: { name: RolesEnum.VIEWER } } as IUser
        groupGrant = true
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => actor.tenantId)
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => actor.id)
        jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => actor)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace',
            tenantId: 'tenant',
            organizationId: 'organization',
            ownerId: 'owner',
            members: [],
            settings: { access: { visibility: 'private' } }
        })
        environment = Object.assign(new Environment(), {
            id: 'bound-environment',
            tenantId: workspace.tenantId,
            organizationId: workspace.organizationId,
            workspaceId: workspace.id,
            name: 'Assistant environment',
            variables: [{ name: 'TEST_SETTING', value: 'fixture', type: 'default' }]
        })
        const runQuery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getCount: jest.fn(async () => (groupGrant ? 1 : 0))
        }
        const workspaceRepository = {
            findOne: jest.fn(async ({ where }: FindOneOptions<XpertWorkspace>) => {
                if (!where || Array.isArray(where)) return null
                return where.id === workspace.id && where.tenantId === workspace.tenantId ? workspace : null
            }),
            manager: { createQueryBuilder: () => runQuery }
        } as unknown as Repository<XpertWorkspace>
        access = new XpertWorkspaceAccessService(workspaceRepository)
        save = jest.fn()
        const environmentRepository = {
            findOne: jest.fn(async ({ where }: FindOneOptions<Environment>) => {
                if (!where || Array.isArray(where)) return null
                return where.id === environment.id && where.tenantId === environment.tenantId ? environment : null
            }),
            save
        } as unknown as Repository<Environment>
        environments = new EnvironmentService(environmentRepository, access)
        compile = jest.fn(async () => {
            throw graphBoundary
        })
        const workAreas = {
            resolve: jest.fn().mockResolvedValue({
                volumeScope: { tenantId: 'tenant', userId: 'guest' },
                volumePath: '/volume',
                workingDirectory: '/workspace',
                workspaceRoot: '/workspace'
            })
        }
        handler = new XpertAgentInvokeHandler(
            { execute: compile } as unknown as CommandBus,
            null,
            null,
            environments,
            null,
            null,
            null,
            workAreas as unknown as XpertWorkAreaResolver,
            undefined,
            null
        )
    })

    afterEach(() => jest.restoreAllMocks())

    function invoke(isDraft = false) {
        return handler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Hello' } },
                'primary',
                { id: 'assistant', workspaceId: workspace.id, environmentId: environment.id },
                {
                    isDraft,
                    rootExecutionId: 'execution',
                    execution: null,
                    subscriber: new Subscriber<MessageEvent>(),
                    store: null
                }
            )
        )
    }

    it('loads the bound environment for a run-only user without granting authoring access', async () => {
        await expect(access.getCapabilities(workspace)).resolves.toEqual({
            canRun: true,
            canRead: false,
            canWrite: false,
            canManage: false
        })
        await expect(invoke()).rejects.toBe(graphBoundary)
        expect(compile).toHaveBeenCalledTimes(1)
        expect(compile).toHaveBeenCalledWith(expect.any(CompileGraphCommand))
        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ options: expect.objectContaining({ environment }) })
        )
        expect(RequestContext.currentUserId()).toBe('guest')

        await expect(environments.findOne(environment.id)).rejects.toThrow(ForbiddenException)
        await expect(environments.update(environment.id, { name: 'Changed' })).rejects.toThrow(ForbiddenException)
        await expect(access.assertCanAuthor(workspace.id)).rejects.toThrow(ForbiddenException)
        await expect(access.assertCanManage(workspace.id)).rejects.toThrow(ForbiddenException)
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects runtime access after the published Assistant grant is revoked', async () => {
        await expect(invoke()).rejects.toBe(graphBoundary)
        compile.mockClear()
        groupGrant = false
        await expect(invoke()).rejects.toThrow(ForbiddenException)
        expect(compile).not.toHaveBeenCalled()
    })

    it('keeps draft execution behind the authoring read check', async () => {
        await expect(invoke(true)).rejects.toThrow(ForbiddenException)
        expect(compile).not.toHaveBeenCalled()
    })

    it.each([false, true])('allows the workspace owner to load the environment (draft=%s)', async (isDraft) => {
        actor = { ...actor, id: workspace.ownerId }
        groupGrant = false
        await expect(invoke(isDraft)).rejects.toBe(graphBoundary)
        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ options: expect.objectContaining({ environment }) })
        )
    })

    it('rejects runtime access outside the current organization', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('another-organization')
        await expect(invoke()).rejects.toThrow(ForbiddenException)
        expect(compile).not.toHaveBeenCalled()
    })

    it('does not load an environment from another tenant', async () => {
        actor = { ...actor, tenantId: 'another-tenant' }
        await expect(invoke()).rejects.toThrow(NotFoundException)
        expect(compile).not.toHaveBeenCalled()
    })

    it('rejects runtime access to an archived workspace', async () => {
        workspace.status = 'archived'
        await expect(invoke()).rejects.toThrow(ForbiddenException)
        expect(compile).not.toHaveBeenCalled()
    })
})
