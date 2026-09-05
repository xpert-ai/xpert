jest.mock('@xpert-ai/server-core', () => ({
    ApiKeyOrClientSecretAuthGuard: class ApiKeyOrClientSecretAuthGuard {},
    Public: () => () => undefined,
    TransformInterceptor: class TransformInterceptor {}
}))

jest.mock('./published-xpert-access.service', () => ({
    PublishedXpertAccessService: class PublishedXpertAccessService {}
}))

import { XpertAccessController } from './xpert-access.controller'

describe('XpertAccessController', () => {
    it('returns the accessible xpert id and avatar without exposing runtime internals', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'xpert-1',
                avatar: { emoji: { id: 'compass', unified: '1f9ed' } },
                options: { private: true },
                graph: { private: true }
            }))
        }
        const controller = new XpertAccessController(publishedXpertAccessService as never)

        await expect(controller.getAccessiblePublishedXpert('xpert-1')).resolves.toEqual({
            id: 'xpert-1',
            avatar: { emoji: { id: 'compass', unified: '1f9ed' } }
        })
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
    })

    it('propagates an access denial without returning presentation data', async () => {
        const access = { getAccessiblePublishedXpert: jest.fn().mockRejectedValue(new Error('forbidden')) }
        const controller = new XpertAccessController(access as never)
        await expect(controller.getAccessiblePublishedXpert('other')).rejects.toThrow('forbidden')
    })
})
