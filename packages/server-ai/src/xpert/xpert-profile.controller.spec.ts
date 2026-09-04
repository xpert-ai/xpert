import { XpertProfileController } from './xpert-profile.controller'
import { PublishedXpertAccessService } from './published-xpert-access.service'
import { Xpert } from './xpert.entity'
import { XpertProfileIndicatorsService } from './xpert-profile-indicators.service'

describe('XpertProfileController', () => {
    it('uses published access and returns only presentation fields', async () => {
        const access = Object.create(PublishedXpertAccessService.prototype) as PublishedXpertAccessService
        const xpert = Object.assign(new Xpert(), {
            id: 'assistant',
            name: 'Assistant',
            description: 'A description',
            prompt: 'private',
            options: { secret: 'private' },
            graph: { private: true },
            draft: { private: true },
            tags: [{ id: 'tag', name: 'Operations', color: 'green', tenantId: 'private' }],
            workspace: { id: 'workspace', name: 'Factory', secret: 'private' },
            createdBy: { id: 'creator', firstName: 'Test', lastName: 'Owner', email: 'private@example.test' }
        })
        jest.spyOn(access, 'getAccessiblePublishedXpert').mockResolvedValue(xpert)
        const indicators = Object.create(XpertProfileIndicatorsService.prototype) as XpertProfileIndicatorsService
        jest.spyOn(indicators, 'getIndicators').mockResolvedValue({
            skillCount: 2,
            toolCount: 4,
            subAgentCount: 3,
            conversationCount30d: 12
        })
        const result = await new XpertProfileController(access, indicators).getProfile('assistant')
        expect(access.getAccessiblePublishedXpert).toHaveBeenCalledWith('assistant', {
            relations: ['tags', 'workspace', 'createdBy', 'agent']
        })
        expect(indicators.getIndicators).toHaveBeenCalledWith(xpert)
        expect(result.indicators).toEqual({
            skillCount: 2,
            toolCount: 4,
            subAgentCount: 3,
            conversationCount30d: 12
        })
        expect(result.creator).toEqual({ id: 'creator', name: 'Test Owner' })
        expect(JSON.stringify(result)).not.toContain('private')
        expect(result.tags).toEqual([{ id: 'tag', name: 'Operations', color: 'green' }])
    })
    it('propagates an access denial instead of returning an unprotected summary', async () => {
        const access = Object.create(PublishedXpertAccessService.prototype) as PublishedXpertAccessService
        jest.spyOn(access, 'getAccessiblePublishedXpert').mockRejectedValue(new Error('forbidden'))
        const indicators = Object.create(XpertProfileIndicatorsService.prototype) as XpertProfileIndicatorsService
        jest.spyOn(indicators, 'getIndicators')
        await expect(new XpertProfileController(access, indicators).getProfile('other')).rejects.toThrow('forbidden')
        expect(indicators.getIndicators).not.toHaveBeenCalled()
    })
})
