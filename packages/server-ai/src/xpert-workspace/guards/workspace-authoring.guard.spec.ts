import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { XpertWorkspaceAccessService } from '../workspace-access.service'
import { WorkspaceAuthoringGuard } from './workspace-authoring.guard'

@Controller('test-workspaces')
class WorkspaceTestController {
    @Get(':workspaceId')
    @UseGuards(WorkspaceAuthoringGuard)
    get() {
        return { ok: true }
    }
}

describe('Workspace authoring HTTP boundary', () => {
    const access = { assertCanAuthor: jest.fn() }
    let app: INestApplication
    let origin: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [WorkspaceTestController],
            providers: [WorkspaceAuthoringGuard, { provide: XpertWorkspaceAccessService, useValue: access }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => access.assertCanAuthor.mockReset())

    it.each(['null', 'undefined', 'invalid'])('rejects %s before it can reach a database UUID query', async (id) => {
        expect((await fetch(`${origin}/test-workspaces/${id}`)).status).toBe(400)
        expect(access.assertCanAuthor).not.toHaveBeenCalled()
    })
    it('still checks authoring permission for a valid identifier', async () => {
        const id = '11111111-1111-4111-8111-111111111111'
        expect((await fetch(`${origin}/test-workspaces/${id}`)).status).toBe(200)
        expect(access.assertCanAuthor).toHaveBeenCalledWith(id)
    })
})
