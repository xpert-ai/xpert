jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentInvocation,
    DefaultRuntimeCapabilityRegistry,
    ProjectAccessRuntimeCapability,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { GetXpertWorkflowQuery } from '../xpert/queries/get-xpert-workflow.query'
import { AssertXpertAgentExecutionAccessQuery } from '../xpert-agent-execution/queries/assert-access.query'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationsController } from './invocations.controller'
import { NativeAgentInvocationReader } from './native-invocation-reader'

const id = '00000000-0000-4000-8000-000000000001'
const callerId = '00000000-0000-4000-8000-000000000002'
const expertId = '00000000-0000-4000-8000-000000000003'
const parentId = '00000000-0000-4000-8000-000000000004'

function fixture(provider = 'xpert', reference = callerId) {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    const invocation: AgentInvocation = {
        id,
        revision: 3,
        status: 'succeeded',
        createdAt: '2026-09-22T00:00:00Z',
        updatedAt: '2026-09-22T00:00:01Z',
        scope: {
            tenantId: 'tenant',
            organizationId: 'organization',
            userId: 'owner',
            workspaceId: 'workspace',
            callerXpertId: callerId,
            callerAgentKey: 'leader',
            parentExecutionId: parentId
        },
        request: {
            target: {
                provider,
                reference,
                revision: '1',
                bindingId: `xpert:${reference}:worker`,
                configuration: { entry: 'worker' }
            },
            callId: 'call-1',
            input: { prompt: '' }
        },
        result: { text: 'done' }
    }
    const entity = Object.assign(new AgentInvocationEntity(), {
        id,
        ownerId: 'owner',
        tenantId: 'tenant',
        organizationId: 'organization',
        invocation
    })
    const records = {
        findOneBy: jest.fn(async (where: Partial<AgentInvocationEntity>) =>
            where.id === id &&
            where.ownerId === entity.ownerId &&
            where.tenantId === entity.tenantId &&
            where.organizationId === entity.organizationId
                ? entity
                : null
        )
    }
    const caller = {
        agent: { team: { id: callerId, tenantId: 'tenant', organizationId: 'organization', workspaceId: 'workspace' } }
    }
    const target = {
        agent: {
            team: { id: reference, tenantId: 'tenant', organizationId: 'organization', workspaceId: 'target-workspace' }
        }
    }
    const queries = {
        execute: jest.fn(async (query: unknown) => {
            if (query instanceof GetXpertWorkflowQuery) return query.id === callerId ? caller : target
            if (query instanceof AssertXpertAgentExecutionAccessQuery) return { xpertId: callerId }
            throw new Error('Unexpected query')
        })
    }
    const projects = { assertEdit: jest.fn(), assertManage: jest.fn(), listReadable: jest.fn() }
    const capabilities = new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, projects)
    const native = new NativeAgentInvocationReader(queries as unknown as QueryBus, capabilities)
    const external = { inspect: jest.fn().mockResolvedValue(invocation), cancel: jest.fn(), respond: jest.fn() }
    const factory = { createScopedApi: jest.fn().mockReturnValue(external) }
    const controller = new AgentInvocationsController(
        records as unknown as Repository<AgentInvocationEntity>,
        factory as unknown as AgentInvocationFactoryService,
        native
    )
    return { controller, invocation, entity, records, queries, caller, target, projects, factory, external }
}

describe('Agent invocation HTTP inspection', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([callerId, expertId])(
        'reads native target %s without resolving a UUID binding or dispatching a provider',
        async (reference) => {
            const f = fixture('xpert', reference)
            const result = await f.controller.inspect(id)
            expect(result).toEqual(f.invocation)
            expect(result).not.toBe(f.invocation)
            expect(f.factory.createScopedApi).not.toHaveBeenCalled()
            expect(f.queries.execute).toHaveBeenCalledWith(new GetXpertWorkflowQuery(reference))
            expect(f.queries.execute).toHaveBeenCalledWith(new AssertXpertAgentExecutionAccessQuery(parentId))
        }
    )
    it.each(['queued', 'running', 'waiting', 'succeeded', 'failed', 'unknown'] as const)(
        'does not change the native %s observation while inspecting',
        async (status) => {
            const f = fixture()
            f.invocation.status = status
            expect(await f.controller.inspect(id)).toMatchObject({ status, revision: 3 })
            expect(f.invocation).toMatchObject({ status, revision: 3 })
        }
    )
    it('reads native Task snapshots using the target workspace without querying the logical parent as a UUID', async () => {
        const f = fixture('xpert-task', expertId)
        f.invocation.scope.workspaceId = 'target-workspace'
        f.invocation.scope.parentExecutionId = 'task:logical-parent'
        expect(await f.controller.inspect(id)).toEqual(f.invocation)
        expect(
            f.queries.execute.mock.calls.some(([query]) => query instanceof AssertXpertAgentExecutionAccessQuery)
        ).toBe(false)
        expect(f.factory.createScopedApi).not.toHaveBeenCalled()
    })
    it.each(['owner', 'tenant', 'organization'])(
        'rejects a different authenticated %s before reading native details',
        async (field) => {
            const f = fixture()
            if (field === 'owner') jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('other')
            if (field === 'tenant') jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('other')
            if (field === 'organization') jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('other')
            await expect(f.controller.inspect(id)).rejects.toMatchObject({ code: 'NotFound' })
            expect(f.queries.execute).not.toHaveBeenCalled()
        }
    )
    it('rejects a stored JSON scope that disagrees with its owner column', async () => {
        const f = fixture()
        f.invocation.scope.userId = 'another-owner'
        await expect(f.controller.inspect(id)).rejects.toMatchObject({ code: 'NotFound' })
        expect(f.queries.execute).not.toHaveBeenCalled()
    })
    it('rejects workspace reassignment', async () => {
        const f = fixture()
        f.caller.agent.team.workspaceId = 'other-workspace'
        await expect(f.controller.inspect(id)).rejects.toMatchObject({ code: 'InvalidScope' })
    })
    it('preserves permission failures as HTTP 403 instead of wrapping them in a generic error', async () => {
        const f = fixture('xpert', expertId)
        f.queries.execute.mockImplementation(async (query) => {
            if (query instanceof GetXpertWorkflowQuery && query.id === expertId) throw new ForbiddenException('Revoked')
            return f.caller
        })
        await expect(f.controller.inspect(id)).rejects.toMatchObject({ status: 403 })
        expect(f.factory.createScopedApi).not.toHaveBeenCalled()
    })
    it('rechecks project access before returning a cached result', async () => {
        const f = fixture()
        f.invocation.scope.projectId = 'project'
        f.projects.assertEdit.mockRejectedValue(new ForbiddenException('Project revoked'))
        await expect(f.controller.inspect(id)).rejects.toMatchObject({ status: 403 })
        expect(f.queries.execute).not.toHaveBeenCalled()
    })
    it.each(['xpert', 'xpert-task'])('rejects unsupported HTTP native controls for %s', async (provider) => {
        const f = fixture(provider)
        await expect(f.controller.cancel(id)).rejects.toMatchObject({ code: 'Unsupported', status: 422 })
        await expect(f.controller.respond(id, { interactionId: 'approval', response: true })).rejects.toMatchObject({
            code: 'Unsupported',
            status: 422
        })
        expect(f.factory.createScopedApi).not.toHaveBeenCalled()
        expect(f.queries.execute).not.toHaveBeenCalled()
    })
    it('preserves external provider inspection and controls', async () => {
        const f = fixture('external-provider')
        await f.controller.inspect(id)
        await f.controller.cancel(id)
        await f.controller.respond(id, { interactionId: 'approval', response: true })
        expect(f.external.inspect).toHaveBeenCalledWith(id)
        expect(f.external.cancel).toHaveBeenCalledWith(id)
        expect(f.external.respond).toHaveBeenCalledWith(id, 'approval', true)
        expect(f.queries.execute).not.toHaveBeenCalled()
    })
})
