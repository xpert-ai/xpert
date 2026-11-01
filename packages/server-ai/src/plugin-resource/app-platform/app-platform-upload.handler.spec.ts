import { Test } from '@nestjs/testing'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { AssertAppPlatformUploadHandler } from './app-platform-upload.handler'
import { assertAppPlatformUpload, AssertAppPlatformUploadCommand } from '../../shared/app-platform-resource-policy'

function fixture() {
    const delivery = {
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: { maxUploadBytes: 10 } } }
        }
    }
    const repository = { findOneBy: jest.fn().mockResolvedValue(delivery) }
    const manager = { getRepository: jest.fn().mockReturnValue(repository) }
    const database = { manager }
    return { repository, manager, database, handler: new AssertAppPlatformUploadHandler(database as never) }
}

describe('account upload size policy', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())

    it.each([0, 9, 10])('admits %s bytes within the account allowance', async (bytes) => {
        const f = fixture()
        await expect(f.handler.execute(new AssertAppPlatformUploadCommand(bytes))).resolves.toBeUndefined()
        expect(f.manager.getRepository).toHaveBeenCalledWith(AppPlatformDelivery)
        expect(f.repository.findOneBy).toHaveBeenCalledWith({ tenantId: 'tenant', userId: 'user' })
    })

    it.each([11, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        'rejects an excessive or invalid byte count: %s',
        async (bytes) => {
            const f = fixture()
            await expect(f.handler.execute(new AssertAppPlatformUploadCommand(bytes))).rejects.toMatchObject({
                status: 413,
                response: { code: 'application_upload_limit' }
            })
        }
    )

    it('preserves ordinary platform uploads when no managed account plan exists', async () => {
        const f = fixture()
        f.repository.findOneBy.mockResolvedValue(null)
        await expect(f.handler.execute(new AssertAppPlatformUploadCommand(1000))).resolves.toBeUndefined()
    })

    it('uses the current account on each call without caching another user’s plan', async () => {
        const f = fixture()
        await f.handler.execute(new AssertAppPlatformUploadCommand(10))
        jest.mocked(RequestContext.currentUserId).mockReturnValue('second-user')
        await f.handler.execute(new AssertAppPlatformUploadCommand(10))
        expect(f.repository.findOneBy.mock.calls).toEqual([
            [{ tenantId: 'tenant', userId: 'user' }],
            [{ tenantId: 'tenant', userId: 'second-user' }]
        ])
    })

    it('registers the shared command with Nest and propagates rejection to callers', async () => {
        const f = fixture()
        const module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [AssertAppPlatformUploadHandler, { provide: DataSource, useValue: f.database }]
        }).compile()
        try {
            await module.init()
            await expect(assertAppPlatformUpload(module.get(CommandBus), 11)).rejects.toMatchObject({ status: 413 })
            await expect(assertAppPlatformUpload(module.get(CommandBus), 10)).resolves.toBeUndefined()
        } finally {
            await module.close()
        }
    })
})
