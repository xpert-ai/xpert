jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    DefaultRuntimeCapabilityRegistry,
    ProjectAccessRuntimeCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { ModelExecutionSourceService } from './execution-source.service'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../agent-invocation/invocation.entity'
import { CliSession } from './execution.entity'
import { ModelExecutionContext } from '@xpert-ai/contracts'

describe('Project invocation model policy source', () => {
    async function fixture() {
        const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        const assistantId = randomUUID()
        const conversationId = randomUUID()
        const source = {
            type: 'agent_invocation' as const,
            invocationId: randomUUID(),
            bindingId: randomUUID(),
            bindingRevision: '1'
        }
        const target = {
            bindingId: source.bindingId,
            revision: '1',
            provider: 'opencode',
            reference: 'profile',
            configuration: { modelSource: { type: 'assistant', xpertId: assistantId } }
        }
        const scope = {
            ...actor,
            callerType: 'project_agent',
            callerAgentKey: 'general_agent',
            conversationId,
            projectId: randomUUID(),
            workspaceId: randomUUID()
        }
        const row = { invocation: { scope, status: 'running', request: { target } } }
        const invocations = { findOneBy: jest.fn(async () => row) }
        const projects = { assertEdit: jest.fn(), assertManage: jest.fn(), listReadable: jest.fn() }
        const bindings = { findOneBy: jest.fn(async () => ({ target, workspaceIds: [scope.workspaceId] })) }
        const registry = new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, projects)
        const module = await Test.createTestingModule({
            providers: [
                ModelExecutionSourceService,
                { provide: getRepositoryToken(CliSession), useValue: {} },
                { provide: getRepositoryToken(AgentInvocationEntity), useValue: invocations },
                { provide: getRepositoryToken(AgentRuntimeBindingEntity), useValue: bindings },
                { provide: XPERT_RUNTIME_CAPABILITIES_TOKEN, useValue: registry }
            ]
        }).compile()
        const context: ModelExecutionContext = {
            tenantId: actor.tenantId,
            runtimeOrganizationId: actor.organizationId,
            actorUserId: actor.userId,
            billableUserId: actor.userId,
            xpertId: assistantId,
            assistantVersion: '1',
            conversationId,
            source,
            environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'instance' },
            tool: { id: 'opencode', version: '1.18.33' }
        }
        return {
            service: module.get(ModelExecutionSourceService),
            actor,
            scope,
            context,
            source,
            conversationId,
            assistantId,
            projects,
            target,
            invocations,
            bindings
        }
    }
    it('uses only the pinned explicit Assistant for model authorization while preserving the Project caller', async () => {
        const f = await fixture()
        expect(await f.service.invocationModelSource(f.actor, f.conversationId, f.source)).toEqual({
            id: f.assistantId,
            workspaceId: f.scope.workspaceId
        })
        expect(f.projects.assertEdit).toHaveBeenCalledWith({ actor: f.actor, projectId: f.scope.projectId })
        await expect(f.service.assertCurrent(f.context)).resolves.toBeUndefined()
        await expect(f.service.assertCurrent({ ...f.context, xpertId: randomUUID() })).rejects.toThrow()
    })
    it('revalidates project membership, conversation ownership, source kind and binding revision', async () => {
        const f = await fixture()
        await expect(f.service.invocationModelSource(f.actor, randomUUID(), f.source)).rejects.toThrow()
        await expect(
            f.service.invocationModelSource(f.actor, f.conversationId, { ...f.source, bindingRevision: '2' })
        ).rejects.toThrow()
        f.projects.assertEdit.mockRejectedValueOnce(new Error('membership revoked'))
        await expect(f.service.invocationModelSource(f.actor, f.conversationId, f.source)).rejects.toThrow(
            'membership revoked'
        )
        f.target.configuration.modelSource.type = 'guessed'
        await expect(f.service.invocationModelSource(f.actor, f.conversationId, f.source)).rejects.toThrow()
    })
})
