import { IIntegration } from '@metad/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  PluginContext,
  USER_PERMISSION_SERVICE_TOKEN
} from '@xpert-ai/plugin-sdk'
import { LarkChannelStrategy } from './lark-channel.strategy'
import { TIntegrationLarkOptions } from './types'

function createFixture() {
  const integrationPermissionService = {
    read: jest.fn()
  }
  const userPermissionService = {
    read: jest.fn(),
    provisionByThirdPartyIdentity: jest.fn()
  }

  const pluginContext: PluginContext = {
    resolve: jest.fn((token: unknown) => {
      if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
        return integrationPermissionService
      }
      if (token === USER_PERMISSION_SERVICE_TOKEN) {
        return userPermissionService
      }
      throw new Error(`Unexpected token: ${String(token)}`)
    })
  } as any

  const strategy = new LarkChannelStrategy(pluginContext)

  const userGet = jest.fn()
  const batchGetId = jest.fn()
  const client = {
    contact: {
      v3: {
        user: {
          get: userGet,
          batchGetId: batchGetId
        }
      }
    }
  }

  jest.spyOn(strategy as any, 'getOrCreateLarkClient').mockReturnValue({
    client
  })
  const getUser = jest.spyOn(strategy as any, 'getUser').mockResolvedValue({ id: 'user-target-1' })

  const integration: Partial<IIntegration<TIntegrationLarkOptions>> = {
    id: 'integration-1',
    tenantId: 'tenant-1',
    options: {
      appId: 'app-id',
      appSecret: 'app-secret',
      verificationToken: 'vt',
      encryptKey: 'ek',
      xpertId: 'xpert-1',
      preferLanguage: 'en'
    }
  }
  integrationPermissionService.read.mockResolvedValue(integration)

  return {
    strategy,
    integrationPermissionService,
    client,
    userGet,
    batchGetId,
    getUser
  }
}

describe('LarkChannelStrategy.resolveUserByRecipient', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves union_id recipient directly', async () => {
    const { strategy, getUser, userGet, batchGetId } = createFixture()

    const user = await strategy.resolveUserByRecipient('integration-1', {
      type: 'union_id',
      id: 'uu_1'
    })

    expect(user).toEqual({ id: 'user-target-1' })
    expect(getUser).toHaveBeenCalledWith(expect.any(Object), 'tenant-1', 'uu_1', undefined)
    expect(userGet).not.toHaveBeenCalled()
    expect(batchGetId).not.toHaveBeenCalled()
  })

  it('resolves open_id recipient through contact.v3.user.get', async () => {
    const { strategy, userGet, getUser } = createFixture()
    userGet.mockResolvedValue({
      data: {
        user: {
          union_id: 'uu_from_open'
        }
      }
    })

    await strategy.resolveUserByRecipient('integration-1', {
      type: 'open_id',
      id: 'ou_1'
    })

    expect(userGet).toHaveBeenCalledWith({
      params: {
        user_id_type: 'open_id'
      },
      path: {
        user_id: 'ou_1'
      }
    })
    expect(getUser).toHaveBeenCalledWith(expect.any(Object), 'tenant-1', 'uu_from_open', undefined)
  })

  it('resolves email recipient through batchGetId', async () => {
    const { strategy, batchGetId, getUser } = createFixture()
    batchGetId.mockResolvedValue({
      data: {
        user_list: [
          {
            user_id: 'uu_from_email'
          }
        ]
      }
    })

    await strategy.resolveUserByRecipient('integration-1', {
      type: 'email',
      id: 'target@example.com'
    })

    expect(batchGetId).toHaveBeenCalledWith({
      params: {
        user_id_type: 'union_id'
      },
      data: {
        emails: ['target@example.com']
      }
    })
    expect(getUser).toHaveBeenCalledWith(expect.any(Object), 'tenant-1', 'uu_from_email', undefined)
  })

  it('returns null for chat_id recipient without querying integration', async () => {
    const { strategy, integrationPermissionService, getUser } = createFixture()

    const user = await strategy.resolveUserByRecipient('integration-1', {
      type: 'chat_id',
      id: 'oc_chat_1'
    })

    expect(user).toBeNull()
    expect(integrationPermissionService.read).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('returns null when open_id lookup throws', async () => {
    const { strategy, userGet, getUser } = createFixture()
    userGet.mockRejectedValue(new Error('lookup failed'))

    const user = await strategy.resolveUserByRecipient('integration-1', {
      type: 'open_id',
      id: 'ou_1'
    })

    expect(user).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })
})
