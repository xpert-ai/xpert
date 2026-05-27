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
    it('returns the accessible xpert id without assistant binding shortcuts', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'xpert-1'
            }))
        }
        const controller = new XpertAccessController(publishedXpertAccessService as never)

        await expect(controller.getAccessiblePublishedXpert('xpert-1')).resolves.toEqual({
            id: 'xpert-1'
        })
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
    })
})
