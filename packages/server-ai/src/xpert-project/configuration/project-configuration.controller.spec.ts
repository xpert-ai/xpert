jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IUser } from '@xpert-ai/contracts'
import { ProjectConfigurationController } from './project-configuration.controller'
import { ProjectConfigurationService } from './project-configuration.service'
import { XpertProjectAccessService } from '../services/project-access.service'

describe('Project configuration HTTP boundary', () => {
    let app: INestApplication, url: string
    const access = { assertCanManage: jest.fn(), assertCanRead: jest.fn() }
    const configurations = { get: jest.fn(), update: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectConfigurationController],
            providers: [
                { provide: ProjectConfigurationService, useValue: configurations },
                { provide: XpertProjectAccessService, useValue: access }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: Request, _response: Response, next: NextFunction) => {
            request.user = { id: 'user', tenantId: 'tenant' }; next()
        })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/project/type-configuration`
    })
    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user', tenantId: 'tenant' } as IUser)
        configurations.update.mockImplementation(async (_project, input) => input)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())
    const put = (body: unknown) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

    it('passes validated configuration with the URL Project identity', async () => {
        const input = { revision: 1, values: { taskExecutionMaxDurationSeconds: 7200 } }
        expect((await put(input)).status).toBe(200)
        expect(configurations.update).toHaveBeenCalledWith('project', input)
        expect(access.assertCanManage).toHaveBeenCalledWith('project')
    })
    it.each([{ values: {} }, { revision: '1', values: {} }, { revision: -1, values: {} },
        { revision: 0, values: {}, tenantId: 'other' }, { revision: 0, values: [] }])('rejects invalid body %j', async (body) => {
        expect((await put(body)).status).toBe(400)
        expect(configurations.update).not.toHaveBeenCalled()
    })
    it('prevents non-managers from changing configuration while allowing authorized reads', async () => {
        access.assertCanManage.mockRejectedValue(new ForbiddenException())
        expect((await put({ revision: 0, values: {} })).status).toBe(403)
        expect(configurations.update).not.toHaveBeenCalled()
        expect((await fetch(url)).status).toBe(200)
        expect(access.assertCanRead).toHaveBeenCalledWith('project')
    })
})
