import type { Permissions } from '@xpert-ai/plugin-sdk'
import { SSO_BINDING_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'

const { assertPermissionForToken } = require('./index')
const {
  createGuardedSsoBindingPermissionService,
  PluginSsoBindingPermissionService
} = require('./sso-binding-permission')

describe('SSO binding plugin permissions', () => {
  let challengeService: {
    create: jest.Mock
  }
  let moduleRef: {
    get: jest.Mock
  }
  let service: InstanceType<typeof PluginSsoBindingPermissionService>

  beforeEach(() => {
    jest.clearAllMocks()
    challengeService = {
      create: jest.fn().mockResolvedValue({
        ticket: 'ticket-1'
      })
    }
    moduleRef = {
      get: jest.fn().mockReturnValue(challengeService)
    }
    service = new PluginSsoBindingPermissionService(moduleRef as any)
  })

  it('blocks token resolution when sso_binding permission is not declared', () => {
    expect(() =>
      assertPermissionForToken(
        'demo-plugin',
        SSO_BINDING_PERMISSION_SERVICE_TOKEN,
        new Set(['user'])
      )
    ).toThrow(/without declaring 'sso_binding' permission/)
  })

  it('denies calls when sso_binding.create is not declared', async () => {
    const guardedService = createGuardedSsoBindingPermissionService(
      'demo-plugin',
      service,
      [
        {
          type: 'sso_binding',
          operations: ['read' as any]
        }
      ] as Permissions
    )

    await expect(
      guardedService.createPendingBinding({
        provider: 'lark',
        subjectId: 'union-1',
        tenantId: 'tenant-1'
      })
    ).rejects.toThrow(/operation 'create'/)
  })

  it('denies calls for undeclared providers', async () => {
    const guardedService = createGuardedSsoBindingPermissionService(
      'demo-plugin',
      service,
      [
        {
          type: 'sso_binding',
          operations: ['create'],
          providers: ['github']
        }
      ] as Permissions
    )

    await expect(
      guardedService.createPendingBinding({
        provider: 'lark',
        subjectId: 'union-1',
        tenantId: 'tenant-1'
      })
    ).rejects.toThrow(/without declaring it in 'sso_binding.providers'/)
  })

  it('allows calls when sso_binding.create is declared for the provider', async () => {
    const guardedService = createGuardedSsoBindingPermissionService(
      'demo-plugin',
      service,
      [
        {
          type: 'sso_binding',
          operations: ['create'],
          providers: ['lark']
        }
      ] as Permissions
    )

    await expect(
      guardedService.createPendingBinding({
        provider: 'lark',
        subjectId: 'union-1',
        tenantId: 'tenant-1'
      })
    ).resolves.toEqual({
      ticket: 'ticket-1'
    })
    expect(challengeService.create).toHaveBeenCalledWith({
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1'
    })
  })
})
