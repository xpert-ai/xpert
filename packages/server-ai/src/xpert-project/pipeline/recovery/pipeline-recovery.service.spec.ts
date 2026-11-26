jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { UserType } from '@xpert-ai/contracts'
import {
    RequestContext,
    ProjectPipelineRuntimeAdapterRegistry,
    ProjectPipelineContributionRegistry
} from '@xpert-ai/plugin-sdk'
import { createExecutionIdentity } from '@xpert-ai/server-core'
import { ProjectPipelineRecoveryService } from './pipeline-recovery.service'
import { ProjectPipelineRecoveryStore } from './pipeline-recovery.store'
import { ProjectPipelineEvidenceService } from '../runtime/pipeline-evidence.service'
import { ProjectPipelineAssistantBridgeService } from '../runtime/pipeline-assistant-bridge.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'

it('allows only a live human manager and validates original execution identity before reconciliation', async () => {
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const originalUserId = randomUUID()
    const context = { actor, projectId: randomUUID() }
    const intent = {
        userId: originalUserId,
        xpertId: randomUUID(),
        workspaceId: randomUUID(),
        publishedVersion: '1',
        executionId: randomUUID(),
        conversationId: randomUUID(),
        input: { prompt: 'Continue', context: {} }
    }
    const operation = Object.assign(new ProjectPipelineOperationEntity(), {
        id: randomUUID(),
        kind: 'operation',
        state: 'failed',
        handlerRef: 'fixture.operation@1',
        completionRef: 'fixture.completion@1',
        attempt: 3,
        context: { ...context, actor: { ...actor, userId: originalUserId }, subjects: [] },
        assistantIntent: intent
    })
    const request = jest.fn(async (_c, _input, _mode, authorize: () => Promise<void>) => {
        await authorize()
        return operation
    })
    const complete = jest.fn(async (_c, _claim, _receipt, _completion, authorize: () => Promise<void>) => {
        await authorize()
    })
    const release = jest.fn()
    const reconcile = jest.fn(async () => ({}))
    const assertEdit = jest.fn(async () => ({}))
    const assertManage = jest.fn(async () => ({ role: 'manager' }))
    const verifyOutputs = jest.fn()
    const target = jest.fn(async () => ({ workspaceId: intent.workspaceId, publishedVersion: '1' }))
    const commands = jest.fn(async () =>
        createExecutionIdentity(
            { id: originalUserId, tenantId: actor.tenantId, type: UserType.USER },
            { ...actor, userId: originalUserId, kind: 'user' }
        )
    )
    const executor = { kind: 'assistant' }
    const module = await Test.createTestingModule({
        providers: [
            ProjectPipelineRecoveryService,
            {
                provide: ProjectPipelineRecoveryStore,
                useValue: {
                    request,
                    complete,
                    release,
                    operation: async () => operation,
                    current: async () => ({
                        run: { bindingSnapshot: { executorBindings: { worker: executor } } },
                        spec: { executorSlot: 'worker' }
                    })
                }
            },
            { provide: ProjectAccessRuntimeService, useValue: { assertEdit, assertManage } },
            {
                provide: ProjectPipelineRuntimeAdapterRegistry,
                useValue: {
                    resolve: (kind: string) =>
                        kind === 'assistant_operation'
                            ? { reconcile }
                            : { evaluate: async () => ({ status: 'accepted', evidence: [] }) }
                }
            },
            { provide: ProjectPipelineContributionRegistry, useValue: { listForActor: () => [] } },
            {
                provide: ProjectPipelineEvidenceService,
                useValue: { inputs: jest.fn(), outputs: verifyOutputs, verify: jest.fn() }
            },
            { provide: ProjectPipelineAssistantBridgeService, useValue: { resolve: target } },
            { provide: CommandBus, useValue: { execute: commands } }
        ]
    }).compile()
    const service = module.get(ProjectPipelineRecoveryService)
    const input = { key: 'reconcile-result', operationId: operation.id, version: '1' }
    const user = jest
        .spyOn(RequestContext, 'currentUser')
        .mockReturnValue({ id: actor.userId, type: UserType.COMMUNICATION })
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
    try {
        await expect(service.submit(context, operation, input)).rejects.toMatchObject({ status: 403 })
        expect(request).not.toHaveBeenCalled()
        user.mockReturnValue({ id: actor.userId, type: UserType.USER })
        assertManage.mockResolvedValueOnce({ role: 'assistant' })
        await expect(service.submit(context, operation, input)).rejects.toMatchObject({ status: 403 })
        expect(request).not.toHaveBeenCalled()
        target.mockResolvedValueOnce({ workspaceId: intent.workspaceId, publishedVersion: '2' })
        await expect(service.submit(context, operation, input)).rejects.toThrow()
        expect(reconcile).not.toHaveBeenCalled()
        expect(release).toHaveBeenCalledTimes(1)
        await service.submit(context, operation, input)
        expect(reconcile).toHaveBeenCalledWith(
            expect.objectContaining({
                actor: { ...actor, userId: originalUserId },
                executor: intentWithoutInput(intent)
            })
        )
        expect(verifyOutputs).toHaveBeenCalledTimes(1)
        expect(complete).toHaveBeenCalledWith(
            context,
            operation,
            expect.objectContaining({ status: 'succeeded' }),
            { status: 'accepted', evidence: [] },
            expect.any(Function)
        )
        expect(assertEdit).toHaveBeenCalledWith(
            expect.objectContaining({ actor: { ...actor, userId: originalUserId } })
        )
        expect(await service.describe(context, operation)).toMatchObject({
            recoveryState: 'available',
            items: [{ key: 'reconcile-result' }]
        })
        executor.kind = 'service'
        const unavailable = await service.describe(context, operation)
        expect(unavailable).toMatchObject({ recoveryState: 'unavailable', items: [] })
        expect(unavailable.messages).not.toHaveLength(0)
        operation.leaseExpiresAt = new Date(Date.now() + 120_000)
        expect(await service.describe(context, operation)).toMatchObject({ recoveryState: 'checking', items: [] })
    } finally {
        jest.restoreAllMocks()
        await module.close()
    }
})
function intentWithoutInput(value: {
    input: unknown
    userId: string
    xpertId: string
    workspaceId: string
    publishedVersion: string
    executionId: string
    conversationId: string
}) {
    const { input, ...executor } = value
    return executor
}
