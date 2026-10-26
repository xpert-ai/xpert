import { ForbiddenException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import {
    GetAccessiblePublishedXpertHandler,
    GetAccessiblePublishedXpertQuery
} from './get-accessible-published-xpert.query'

describe('published Assistant access query wiring', () => {
    let module: TestingModule
    let queries: QueryBus
    const access = { getAccessiblePublishedXpert: jest.fn() }

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [GetAccessiblePublishedXpertHandler, { provide: PublishedXpertAccessService, useValue: access }]
        }).compile()
        await module.init()
        queries = module.get(QueryBus)
    })
    beforeEach(() => jest.resetAllMocks())
    afterAll(async () => module?.close())

    it('loads the requested published revision and model relations through the owning access policy', async () => {
        const assistant = { id: 'published', agent: { key: 'executor' } }
        const relations = ['agent', 'agent.copilotModel', 'copilotModel']
        access.getAccessiblePublishedXpert.mockResolvedValue(assistant)
        await expect(queries.execute(new GetAccessiblePublishedXpertQuery('published', relations))).resolves.toBe(
            assistant
        )
        expect(access.getAccessiblePublishedXpert).toHaveBeenCalledWith('published', { relations })
    })

    it('checks live access again and propagates revocation without returning the previous result', async () => {
        access.getAccessiblePublishedXpert.mockResolvedValueOnce({ id: 'published' })
        await queries.execute(new GetAccessiblePublishedXpertQuery('published'))
        const denied = new ForbiddenException()
        access.getAccessiblePublishedXpert.mockRejectedValueOnce(denied)
        await expect(queries.execute(new GetAccessiblePublishedXpertQuery('published'))).rejects.toBe(denied)
        expect(access.getAccessiblePublishedXpert).toHaveBeenCalledTimes(2)
    })
})
