import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotProviderService } from './copilot-provider.service'
import { CopilotProvider } from './copilot-provider.entity'
import { ConnectionDeletionService } from '../copilot/connection-deletion/connection-deletion.service'
import { ConflictException } from '@nestjs/common'

describe('provider writes around connection deletion', () => {
    let module: TestingModule
    let service: CopilotProviderService
    const manager = { findOne: jest.fn(), save: jest.fn(), update: jest.fn(), getRepository: jest.fn() }
    const deletion = {
        delete: jest.fn(),
        rejectRestore: jest.fn(() => {
            throw new ConflictException()
        })
    }
    const existing = Object.assign(new CopilotProvider(), {
        id: 'provider',
        copilotId: 'connection',
        tenantId: 'tenant',
        organizationId: 'org',
        providerName: 'test'
    })
    beforeEach(async () => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        manager.findOne.mockResolvedValue(null)
        manager.getRepository.mockReturnValue({ findOne: manager.findOne })
        module = await Test.createTestingModule({
            providers: [
                CopilotProviderService,
                { provide: ConnectionDeletionService, useValue: deletion },
                {
                    provide: getRepositoryToken(CopilotProvider),
                    useValue: {
                        manager: {
                            transaction: (callback: (value: typeof manager) => Promise<unknown>) => callback(manager)
                        }
                    }
                }
            ]
        }).compile()
        service = module.get(CopilotProviderService)
        jest.spyOn(service, 'findOne').mockResolvedValue(existing)
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await module?.close()
    })

    it('rejects legacy credential creation for a deleted connection', async () => {
        await expect(
            service.create({ copilotId: 'connection', credentials: { api_key: 'synthetic' } })
        ).rejects.toMatchObject({ status: 400 })
        expect(manager.save).not.toHaveBeenCalled()
    })
    it('rejects stale credential edits after connection deletion', async () => {
        await expect(service.update('provider', { credentials: { api_key: 'synthetic' } })).rejects.toMatchObject({
            status: 404
        })
        expect(manager.update).not.toHaveBeenCalled()
    })
    it('rejects stale named connection saves after connection deletion', async () => {
        await expect(
            service.saveNamedConnection({ id: 'provider', providerName: 'test' }, 'Renamed')
        ).rejects.toMatchObject({ status: 400 })
        expect(manager.save).not.toHaveBeenCalled()
    })
    it('routes legacy deletion through the same connection policy and disallows recovery shortcuts', async () => {
        await service.delete('provider')
        expect(deletion.delete).toHaveBeenCalledWith('provider', 'provider')
        for (const action of ['softRemove', 'softDelete', 'softRecover', 'restoreSoftDelete'] as const) {
            await expect(service[action]()).rejects.toBeInstanceOf(ConflictException)
        }
    })
})
