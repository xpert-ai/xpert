import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ModelExecutionContext } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../agent-invocation/invocation.entity'
import { CliSession } from './execution.entity'
import { ModelExecutionSourceService } from './execution-source.service'

describe('execution source authorization', () => {
    const context: ModelExecutionContext = {
        tenantId: 'tenant',
        runtimeOrganizationId: 'org',
        actorUserId: 'user',
        billableUserId: 'user',
        xpertId: 'assistant',
        assistantVersion: 'v1',
        conversationId: 'conversation',
        source: { type: 'cli_session', cliSessionId: 'cli' },
        tool: { id: 'opencode', version: '1.0.0' },
        environment: { type: 'computer', environmentId: 'computer', instanceId: 'generation-1' }
    }

    async function setup() {
        const session = {
            status: 'running',
            tool: context.tool,
            runner: { environmentId: 'computer', instanceId: 'generation-1' }
        }
        const sessions = { findOneBy: jest.fn().mockResolvedValue(session) }
        const invocations = { findOneBy: jest.fn() },
            bindings = { findOneBy: jest.fn() }
        const module = await Test.createTestingModule({
            providers: [
                ModelExecutionSourceService,
                { provide: getRepositoryToken(CliSession), useValue: sessions },
                { provide: getRepositoryToken(AgentInvocationEntity), useValue: invocations },
                { provide: getRepositoryToken(AgentRuntimeBindingEntity), useValue: bindings }
            ]
        }).compile()
        return { service: module.get(ModelExecutionSourceService), session, sessions, invocations, bindings }
    }

    it('requires the original owner, conversation and Assistant', async () => {
        const test = await setup()
        await test.service.assertCurrent(context)
        expect(test.sessions.findOneBy).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            ownerId: 'user',
            id: 'cli',
            conversationId: 'conversation',
            xpertId: 'assistant'
        })
        test.sessions.findOneBy.mockResolvedValue(null)
        await expect(test.service.assertCurrent(context)).rejects.toThrow()
    })
    it.each(['stopping', 'exited', 'unknown'])('rejects new inference when CLI is %s', async (status) => {
        const test = await setup()
        test.session.status = status
        await expect(test.service.assertCurrent(context)).rejects.toThrow()
    })
    it('rejects a replaced container and a changed payer', async () => {
        const test = await setup()
        test.session.runner.instanceId = 'generation-2'
        await expect(test.service.assertCurrent(context)).rejects.toThrow()
        await expect(test.service.assertCurrent({ ...context, billableUserId: 'creator' })).rejects.toThrow()
    })
    it('revokes an invocation when its binding is disabled or revised', async () => {
        const test = await setup()
        const target = {
            bindingId: 'binding',
            revision: 'v1',
            provider: 'opencode',
            reference: 'profile',
            configuration: {}
        }
        test.invocations.findOneBy.mockResolvedValue({
            invocation: {
                status: 'running',
                scope: {
                    conversationId: 'conversation',
                    callerXpertId: 'assistant',
                    workspaceId: 'workspace'
                },
                request: { target }
            }
        })
        test.bindings.findOneBy.mockResolvedValue({ target, workspaceIds: ['workspace'] })
        const managed: ModelExecutionContext = {
            ...context,
            source: {
                type: 'agent_invocation',
                invocationId: 'invocation',
                bindingId: 'binding',
                bindingRevision: 'v1'
            }
        }
        await test.service.assertCurrent(managed)
        test.bindings.findOneBy.mockResolvedValue(null)
        await expect(test.service.assertCurrent(managed)).rejects.toThrow()
        test.bindings.findOneBy.mockResolvedValue({
            target: { ...target, revision: 'v2' },
            workspaceIds: ['workspace']
        })
        await expect(test.service.assertCurrent(managed)).rejects.toThrow()
    })
})
