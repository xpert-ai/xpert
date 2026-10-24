jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { ProjectPipelineProjectionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineProjectionService } from '../projection/pipeline-projection.service'
import { ProjectPipelineProviderActionStore } from './provider-action.store'
import { ProjectPipelineProviderActionsService } from './provider-actions.service'

describe('Actor-scoped provider node diagnostics', () => {
    const context = {
        projectId: 'project-a',
        actor: { userId: 'reader', tenantId: 'tenant-a', organizationId: 'org-a' }
    }
    const input = { instanceId: 'instance-a', nodeInstanceId: 'node-a' }
    const access = { listReadable: jest.fn() },
        store = { target: jest.fn() }
    const providers = { getForActor: jest.fn() },
        describeNode = jest.fn()
    let service: ProjectPipelineProviderActionsService
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ProjectPipelineProviderActionsService,
                { provide: ProjectAccessRuntimeService, useValue: access },
                { provide: ProjectPipelineProviderActionStore, useValue: store },
                { provide: ProjectPipelineProjectionProviderRegistry, useValue: providers },
                { provide: ProjectPipelineProjectionService, useValue: {} }
            ]
        }).compile()
        service = module.get(ProjectPipelineProviderActionsService)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        access.listReadable.mockResolvedValue([{ role: 'viewer' }])
        store.target.mockResolvedValue({
            instance: { ownerRef: 'neutral.reader@1' },
            provider: { ...context, node: { key: 'inspect' } }
        })
        providers.getForActor.mockReturnValue({ describeNode })
        describeNode.mockResolvedValue({ roleDetails: [{ label: 'Binding', value: 'Published reviewer' }] })
    })
    it('allows a viewer to read current diagnostics with the authenticated scope', async () => {
        expect(await service.describe(context, input)).toEqual({
            roleDetails: [{ label: 'Binding', value: 'Published reviewer' }]
        })
        expect(access.listReadable).toHaveBeenCalledWith({ actor: context.actor, projectIds: [context.projectId] })
        expect(store.target).toHaveBeenCalledWith(context, input)
        expect(providers.getForActor).toHaveBeenCalledWith('neutral.reader@1', context.actor)
        expect(describeNode).toHaveBeenCalledWith({ ...context, node: { key: 'inspect' } })
    })
    it('rejects unreadable projects before looking up a target or provider', async () => {
        access.listReadable.mockResolvedValue([])
        await expect(service.describe(context, input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(store.target).not.toHaveBeenCalled()
        expect(describeNode).not.toHaveBeenCalled()
    })
    it('uses the scoped target guard before reading provider metadata', async () => {
        store.target.mockRejectedValue(new ForbiddenException())
        await expect(service.describe(context, input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(describeNode).not.toHaveBeenCalled()
    })
    it('supports old providers and refuses undeclared payload fields', async () => {
        providers.getForActor.mockReturnValue({})
        await expect(service.describe(context, input)).resolves.toBeNull()
        providers.getForActor.mockReturnValue({ describeNode })
        describeNode.mockResolvedValue({ roleDetails: [], permissionOverride: true })
        await expect(service.describe(context, input)).rejects.toThrow()
    })
})
