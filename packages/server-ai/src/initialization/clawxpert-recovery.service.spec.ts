jest.mock('@xpert-ai/server-core', () => ({ UserOrganizationService: class {} }))
jest.mock('../assistant-binding', () => ({ AssistantBindingService: class {} }))
jest.mock('./bootstrap.service', () => ({ ServerAIBootstrapService: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'org-1'),
        currentUserId: jest.fn(() => 'user-1'),
        currentUser: jest.fn(() => ({ role: { name: 'ADMIN' } }))
    }
}))
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Queue } from 'bull'
import type { UserOrganizationService } from '@xpert-ai/server-core'
import type { AssistantBindingService } from '../assistant-binding'
import type { ServerAIBootstrapService } from './bootstrap.service'
import { ClawXpertRecoveryService } from './clawxpert-recovery.service'

function setup() {
    const queue = { getJob: jest.fn().mockResolvedValue(null), add: jest.fn().mockResolvedValue(null) }
    const bindings = {
        getBinding: jest.fn().mockResolvedValue(null),
        getAvailableXperts: jest.fn().mockResolvedValue([])
    }
    const bootstrap = {
        getAvailableClawXpertModel: jest.fn().mockResolvedValue({ copilotId: 'copilot', model: 'llm' })
    }
    const memberships = { count: jest.fn().mockResolvedValue(1) }
    const service = new ClawXpertRecoveryService(
        queue as unknown as Queue,
        bindings as unknown as AssistantBindingService,
        bootstrap as unknown as ServerAIBootstrapService,
        memberships as unknown as UserOrganizationService
    )
    return { service, queue, bindings, bootstrap, memberships }
}

describe('ClawXpertRecoveryService', () => {
    beforeEach(() => jest.clearAllMocks())

    it('reports a late model configuration requirement without enqueueing work', async () => {
        const { service, bootstrap, queue } = setup()
        bootstrap.getAvailableClawXpertModel.mockResolvedValue(null)
        await expect(service.recover()).resolves.toMatchObject({
            status: 'dependency_unavailable',
            code: 'model_required'
        })
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('returns a usable binding without depending on creation-time model configuration', async () => {
        const { service, bindings, bootstrap } = setup()
        bindings.getBinding.mockResolvedValue({ assistantId: 'assistant-1' })
        bindings.getAvailableXperts.mockResolvedValue([{ id: 'assistant-1' }])
        await expect(service.getStatus()).resolves.toMatchObject({ status: 'ready' })
        expect(bootstrap.getAvailableClawXpertModel).not.toHaveBeenCalled()
    })

    it('distinguishes a stale binding from a missing binding', async () => {
        const { service, bindings } = setup()
        await expect(service.getStatus()).resolves.toMatchObject({ status: 'missing', code: 'binding_missing' })
        bindings.getBinding.mockResolvedValue({ assistantId: 'deleted-assistant' })
        await expect(service.getStatus()).resolves.toMatchObject({ status: 'binding_inaccessible' })
    })

    it('uses the membership bootstrap queue and the same stable ID for concurrent requests', async () => {
        const { service, queue } = setup()
        await Promise.all([service.recover(), service.recover()])
        expect(queue.add).toHaveBeenCalledTimes(2)
        for (const call of queue.add.mock.calls) {
            expect(call).toEqual([
                'user-organization-bootstrap',
                { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
                {
                    jobId: 'user-org-bootstrap:org-1:user-1',
                    attempts: 3,
                    backoff: 10_000,
                    removeOnComplete: true
                }
            ])
        }
    })

    it('does not add work when the normal membership bootstrap is already active', async () => {
        const { service, queue } = setup()
        queue.getJob.mockResolvedValue({ getState: jest.fn().mockResolvedValue('active') })
        await expect(service.recover()).resolves.toMatchObject({ status: 'initializing' })
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('retries retained failures without creating another job', async () => {
        const { service, queue } = setup()
        const retry = jest.fn().mockResolvedValue(null)
        queue.getJob.mockResolvedValue({ getState: jest.fn().mockResolvedValue('failed'), retry })
        await expect(service.recover()).resolves.toMatchObject({ status: 'initializing' })
        expect(retry).toHaveBeenCalledTimes(1)
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('rejects a user outside the requested organization before reading bindings', async () => {
        const { service, memberships, bindings, queue } = setup()
        memberships.count.mockResolvedValue(0)
        await expect(service.recover()).rejects.toMatchObject({ status: 403 })
        expect(bindings.getBinding).not.toHaveBeenCalled()
        expect(queue.add).not.toHaveBeenCalled()
        expect(memberships.count).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', isActive: true }
        })
    })

    it('resolves the target organization from each authenticated request', async () => {
        const { service, queue } = setup()
        jest.mocked(RequestContext.getOrganizationId).mockReturnValueOnce('org-2').mockReturnValueOnce('org-2')
        await service.recover()
        expect(queue.add).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ organizationId: 'org-2' }),
            expect.objectContaining({ jobId: 'user-org-bootstrap:org-2:user-1' })
        )
    })
})
