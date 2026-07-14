jest.mock('./xpert-marketplace.service', () => ({
    XpertMarketplaceService: class XpertMarketplaceService {}
}))

import { LanguagesEnum } from '@xpert-ai/contracts'
import { XpertMarketplaceController } from './xpert-marketplace.controller'

describe('XpertMarketplaceController', () => {
    it('accepts shared plugin marketplace categories in agent filters', async () => {
        const service = {
            findMarketplace: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new XpertMarketplaceController(service as never)

        await controller.findMarketplace(LanguagesEnum.English, {
            businessCategories: 'featured'
        })

        expect(service.findMarketplace).toHaveBeenCalledWith(
            expect.objectContaining({ businessCategories: ['featured'] }),
            LanguagesEnum.English
        )
    })
})
