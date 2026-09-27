jest.mock('./xpert-marketplace.service', () => ({
    XpertMarketplaceService: class XpertMarketplaceService {}
}))

import { LanguagesEnum } from '@xpert-ai/contracts'
import { XpertMarketplaceController } from './xpert-marketplace.controller'

describe('XpertMarketplaceController', () => {
    it('accepts business-area IDs independently of marketplace categories and rejects invalid IDs', async () => {
        const service = { findMarketplace: jest.fn().mockResolvedValue({ items: [], total: 0 }) }
        const controller = new XpertMarketplaceController(service as never)
        const id = '3ad87d56-feb7-49e1-85ec-4b4c4fbbaa0d'
        await controller.findMarketplace(LanguagesEnum.English, {
            businessAreaIds: `${id},${id}`,
            businessCategories: 'business-operations'
        })
        expect(service.findMarketplace).toHaveBeenCalledWith(
            expect.objectContaining({ businessAreaIds: [id], businessCategories: ['business-operations'] }),
            LanguagesEnum.English
        )
        await expect(controller.findMarketplace(LanguagesEnum.English, { businessAreaIds: 'sales' })).rejects.toThrow()
        expect(service.findMarketplace).toHaveBeenCalledTimes(1)
    })
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
