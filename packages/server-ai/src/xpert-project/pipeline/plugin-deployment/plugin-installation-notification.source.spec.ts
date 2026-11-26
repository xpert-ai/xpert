import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { projectPluginDeploymentRefs, UserType, type IUser } from '@xpert-ai/contracts'
import { ProjectPluginInstallationNotificationSource } from './plugin-installation-notification.source'
import { ProjectPluginInstallationAuthorizationService } from './plugin-installation-authorization.service'
import { ProjectPluginInstallationAuthorizationStore } from './plugin-installation-authorization.store'
import { ProjectPluginDeploymentStore } from './plugin-deployment.store'
import { ActionNotificationSources } from '../../../user-notification/actions/action-notification.sources'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'

jest.mock('@xpert-ai/server-core', () => ({
    ResolveExecutionIdentityCommand: class {
        constructor(readonly actor: unknown) {}
    },
    runWithExecutionIdentity: async (_identity: unknown, callback: () => Promise<unknown>) => callback()
}))
jest.mock('../../entities/project.entity', () => ({ XpertProject: class XpertProject {} }))
jest.mock('../../entities/project-membership.entity', () => ({
    XpertProjectMembership: class XpertProjectMembership {}
}))
jest.mock('../persistence/pipeline.entity', () => ({
    ProjectPipelineOperationEntity: class ProjectPipelineOperationEntity {}
}))
jest.mock('./plugin-installation-authorization.service', () => ({
    ProjectPluginInstallationAuthorizationService: class {}
}))
jest.mock('./plugin-installation-authorization.store', () => ({
    ProjectPluginInstallationAuthorizationStore: class {}
}))
jest.mock('./plugin-deployment.store', () => ({ ProjectPluginDeploymentStore: class {} }))

it('notifies only current project managers who also pass installation policy, and closes after authorization', async () => {
    const current = jest.fn().mockResolvedValue(undefined)
    const read = jest.fn().mockResolvedValue(null)
    const inspect = jest.fn(async (c: { actor: { userId: string } }) => {
        if (c.actor.userId !== 'manager') throw new ForbiddenException()
        return { request: { packageName: 'plugin', packageVersion: '1.0.0' } }
    })
    const row = Object.assign(new ProjectPipelineOperationEntity(), {
        id: 'operation',
        instanceId: 'pipeline',
        roundId: 'round',
        nodeInstanceId: 'node',
        projectId: 'project',
        tenantId: 'tenant',
        organizationId: 'org',
        kind: 'operation',
        handlerRef: projectPluginDeploymentRefs.operation,
        context: { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'owner' } }
    })
    const members = jest.fn().mockResolvedValue([{ userId: 'manager' }, { userId: 'revoked-manager' }])
    const module = await Test.createTestingModule({
        providers: [
            ProjectPluginInstallationNotificationSource,
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
            { provide: ProjectPluginDeploymentStore, useValue: { current } },
            { provide: ProjectPluginInstallationAuthorizationStore, useValue: { read, version: () => 'version' } },
            {
                provide: ProjectPluginInstallationAuthorizationService,
                useValue: {
                    inspect,
                    input: async () => ({ request: { packageName: 'plugin', packageVersion: '1.0.0' } })
                }
            }
        ]
    }).compile()
    jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ type: UserType.USER } as IUser)
    const source = module.get(ProjectPluginInstallationNotificationSource)
    try {
        expect(await source.describe(row)).toMatchObject({
            recipientIds: ['manager'],
            presentation: { state: 'pending', workbench: { target: 'project.pipelines', pipelineNodeId: 'node' } }
        })
        expect(members.mock.calls[0][1]).toMatchObject({ role: 'manager', projectId: 'project', tenantId: 'tenant' })
        expect(await source.resolve({ tenantId: 'tenant', userId: 'owner' }, source.reference(row))).toBeNull()
        read.mockResolvedValue({ actorId: 'manager' })
        expect(await source.describe(row)).toMatchObject({ presentation: { state: 'handled' } })
        read.mockResolvedValue(null)
        current.mockRejectedValue(new ConflictException())
        expect(await source.describe(row)).toBeNull()
        expect(
            await source.resolve(
                { tenantId: 'tenant', userId: 'manager' },
                { ...source.reference(row), version: 'stale' }
            )
        ).toBeNull()
    } finally {
        jest.restoreAllMocks()
        await module.close()
    }
})
