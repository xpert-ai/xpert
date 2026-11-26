import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { ProjectPipelineRecoveryNotificationSource } from './pipeline-recovery-notification.source'
import { ProjectPipelineRecoveryService, type PipelineRecoveryActions } from './pipeline-recovery.service'
import { ActionNotificationSources } from '../../../user-notification/actions/action-notification.sources'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'

jest.mock('@xpert-ai/server-core', () => ({
    ResolveExecutionIdentityCommand: class {},
    runWithExecutionIdentity: async (_identity: unknown, callback: () => Promise<unknown>) => callback()
}))
jest.mock('../../entities/project.entity', () => ({ XpertProject: class XpertProject {} }))
jest.mock('../../entities/project-membership.entity', () => ({
    XpertProjectMembership: class XpertProjectMembership {}
}))
jest.mock('../persistence/pipeline.entity', () => ({
    ProjectPipelineOperationEntity: class ProjectPipelineOperationEntity {}
}))
jest.mock('./pipeline-recovery.service', () => ({ ProjectPipelineRecoveryService: class {} }))
jest.mock('./pipeline-recovery-record', () => ({ recoveryVersion: () => 'version' }))

it('routes only authorized managers to the exact Bosi node and closes stale or completed recovery', async () => {
    const row = Object.assign(new ProjectPipelineOperationEntity(), {
        id: 'operation',
        state: 'failed',
        kind: 'operation',
        instanceId: 'pipeline',
        roundId: 'round',
        nodeInstanceId: 'node',
        projectId: 'project',
        tenantId: 'tenant',
        organizationId: 'org',
        context: { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'owner' } }
    })
    const presentation = (state: PipelineRecoveryActions['recoveryState']): PipelineRecoveryActions => ({
        operationId: row.id,
        messages: [{ en_US: 'Failure details remain visible' }],
        items: [],
        recoveryState: state
    })
    const describe = jest.fn(async (c: { actor: { userId: string } }) =>
        presentation(c.actor.userId === 'manager' ? 'available' : 'unavailable')
    )
    const members = jest.fn().mockResolvedValue([{ userId: 'manager' }, { userId: 'revoked' }])
    const module = await Test.createTestingModule({
        providers: [
            ProjectPipelineRecoveryNotificationSource,
            ActionNotificationSources,
            {
                provide: DataSource,
                useValue: {
                    manager: {
                        findBy: members,
                        findOneBy: async (entity: { name: string }) =>
                            entity.name === 'XpertProject'
                                ? { name: 'Project', status: 'active', ownerId: 'owner' }
                                : row
                    }
                }
            },
            { provide: CommandBus, useValue: { execute: async () => ({}) } },
            { provide: ProjectPipelineRecoveryService, useValue: { describe } }
        ]
    }).compile()
    const source = module.get(ProjectPipelineRecoveryNotificationSource)
    try {
        expect(await source.describe(row)).toMatchObject({
            recipientIds: ['manager'],
            presentation: {
                state: 'pending',
                workbench: { target: 'project.pipelines', pipelineNodeId: 'node', pipelineInstanceId: 'pipeline' }
            }
        })
        expect(members.mock.calls[0][1]).toMatchObject({ role: 'manager', projectId: 'project' })
        expect(await source.resolve({ tenantId: 'tenant', userId: 'owner' }, source.reference(row))).toBeNull()
        expect(
            await source.resolve(
                { tenantId: 'tenant', userId: 'manager' },
                { ...source.reference(row), version: 'old' }
            )
        ).toBeNull()
        const unavailable = new Error('PIPELINE_ADAPTER_UNAVAILABLE')
        describe.mockRejectedValue(unavailable)
        expect(await source.resolve({ tenantId: 'tenant', userId: 'manager' }, source.reference(row))).toBeNull()
        // Workers must defer the source instead of closing its durable pending notification.
        await expect(source.describe(row)).rejects.toBe(unavailable)
        describe.mockRejectedValue(new Error('unexpected failure'))
        await expect(source.resolve({ tenantId: 'tenant', userId: 'manager' }, source.reference(row))).rejects.toThrow(
            'unexpected failure'
        )
        describe.mockImplementation(async (c) =>
            presentation(c.actor.userId === 'manager' ? 'checking' : 'unavailable')
        )
        expect(await source.resolve({ tenantId: 'tenant', userId: 'manager' }, source.reference(row))).toMatchObject({
            state: 'pending'
        })
        row.state = 'accepted'
        expect(await source.describe(row)).toBeNull()
        row.state = 'failed'
        // Informational messages are not an actionable recovery state.
        describe.mockResolvedValue(presentation('unavailable'))
        expect(await source.describe(row)).toBeNull()
    } finally {
        await module.close()
    }
})
