import { BadRequestException } from '@nestjs/common'

jest.mock('@metad/server-core', () => ({
  RequestContext: {
    currentUserId: jest.fn(),
    getLanguageCode: jest.fn().mockReturnValue('en')
  }
}))

jest.mock('../../xpert.service', () => ({
  XpertService: class XpertService {}
}))

jest.mock('../../../xpert-agent', () => ({
  XpertAgentService: class XpertAgentService {}
}))

jest.mock('../../types', () => ({
  EventName_XpertPublished: 'xpert.published'
}))

import { RequestContext } from '@metad/server-core'
import { XpertPublishCommand } from '../publish.command'
import { XpertPublishHandler } from './publish.handler'

describe('XpertPublishHandler', () => {
  function createHandler(xpertOverrides: Record<string, any> = {}) {
    const xpert = {
      id: 'xpert-1',
      name: 'Support Expert',
      organizationId: null,
      createdById: 'user-1',
      workspaceId: null,
      version: null,
      latest: false,
      draft: {
        team: {},
        nodes: [],
        connections: []
      },
      userGroups: [],
      agent: {
        key: 'Agent_primary'
      },
      agents: [],
      ...xpertOverrides
    }

    const xpertService = {
      findOne: jest.fn().mockResolvedValue(xpert),
      findAll: jest.fn().mockResolvedValue({ items: [xpert] })
    }

    const handler = new XpertPublishHandler(
      xpertService as any,
      {} as any,
      { translate: jest.fn() } as any,
      {} as any,
      {} as any
    )

    return { handler, xpertService, xpert }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('allows tenant creators to publish without user groups', async () => {
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

    const { handler, xpert } = createHandler()
    const publishResult = { id: 'xpert-1', version: '1' }
    const publishSpy = jest.spyOn(handler, 'publish').mockResolvedValue(publishResult as any)

    const result = await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))

    expect(result).toBe(publishResult)
    expect(publishSpy).toHaveBeenCalledWith(xpert, '1', xpert.draft)
  })

  it('still requires a user group when the publisher is not the creator', async () => {
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-2')

    const { handler } = createHandler()

    await expect(handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))).rejects.toThrow(
      BadRequestException
    )
  })

  it('still requires a user group for organization-scoped xperts', async () => {
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

    const { handler } = createHandler({
      organizationId: 'org-1'
    })

    await expect(handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))).rejects.toThrow(
      BadRequestException
    )
  })
})
