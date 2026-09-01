import { IsPublishedXpertInFamilyHandler } from './is-published-xpert-in-family.handler'
import { IsPublishedXpertInFamilyQuery } from '../is-published-xpert-in-family.query'

describe(IsPublishedXpertInFamilyHandler.name, () => {
    it('compares the candidate against the accessible reference assistant family', async () => {
        const referenceXpert = { id: 'xpert-current', slug: 'demo' }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue(referenceXpert),
            isPublishedXpertInFamily: jest.fn().mockResolvedValue(true)
        }
        const handler = new IsPublishedXpertInFamilyHandler(publishedXpertAccessService as never)

        await expect(
            handler.execute(new IsPublishedXpertInFamilyQuery('xpert-previous', 'xpert-current'))
        ).resolves.toBe(true)
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-current')
        expect(publishedXpertAccessService.isPublishedXpertInFamily).toHaveBeenCalledWith(
            'xpert-previous',
            referenceXpert
        )
    })
})
